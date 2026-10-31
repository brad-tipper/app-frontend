/** Async key/value storage (SecureStore on devices, localStorage on web). */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** What is persisted: tokens only. The user comes from `GET /v1/auth/me`. */
export type StoredSession = {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp of the access token's expiry. */
  expiresAt: string;
};

export type SessionStoreOptions = {
  /** API origin, e.g. `https://api.taskscribe.app`. */
  baseUrl: string;
  storage: SessionStorage;
  /** Storage key; defaults to `app.session`. */
  key?: string;
  fetch?: typeof fetch;
};

type Listener = (session: StoredSession | null) => void;

/** Refresh when fewer than this many ms remain on the access token. */
const REFRESH_SKEW_MS = 30_000;

/**
 * Holds the signed-in session, persists it, and refreshes it. Refreshes are
 * single-flight: concurrent 401s share one `/v1/auth/refresh` call, which matters
 * because the server rotates (and spends) the refresh token.
 */
export class SessionStore {
  private session: StoredSession | null = null;
  private loaded: Promise<void> | null = null;
  private inflight: Promise<StoredSession | null> | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SessionStoreOptions) {
    this.key = options.key ?? "app.session";
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
  }

  /** Loads the persisted session once. Safe to call repeatedly. */
  load(): Promise<StoredSession | null> {
    this.loaded ??= this.options.storage
      .getItem(this.key)
      .then((raw) => {
        if (!raw || this.session) return;
        try {
          const parsed = JSON.parse(raw) as StoredSession;
          if (parsed.accessToken && parsed.refreshToken) this.session = parsed;
        } catch {
          // A corrupt entry is treated as signed out.
        }
      })
      .catch(() => undefined);
    return this.loaded.then(() => this.session);
  }

  get(): StoredSession | null {
    return this.session;
  }

  async set(session: StoredSession | null): Promise<void> {
    this.session = session;
    this.loaded ??= Promise.resolve();
    if (session) {
      await this.options.storage.setItem(this.key, JSON.stringify(session)).catch(() => undefined);
    } else {
      await this.options.storage.removeItem(this.key).catch(() => undefined);
    }
    for (const listener of this.listeners) listener(session);
  }

  clear(): Promise<void> {
    return this.set(null);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A valid access token, refreshing first when it is about to expire. */
  async getAccessToken(): Promise<string | null> {
    const session = await this.load();
    if (!session) return null;
    if (Date.parse(session.expiresAt) - Date.now() < REFRESH_SKEW_MS) {
      return (await this.refresh())?.accessToken ?? null;
    }
    return session.accessToken;
  }

  /** Exchanges the refresh token for a new pair. Returns null (and signs out) if rejected. */
  refresh(): Promise<StoredSession | null> {
    this.inflight ??= this.doRefresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async doRefresh(): Promise<StoredSession | null> {
    const current = await this.load();
    if (!current) return null;
    try {
      const response = await this.fetchImpl(`${this.options.baseUrl}/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (response.status === 401 || response.status === 403) {
        await this.clear();
        return null;
      }
      if (!response.ok) return null; // transient: keep the session and let the caller retry later
      const next = (await response.json()) as StoredSession;
      const stored: StoredSession = {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        expiresAt: next.expiresAt,
      };
      await this.set(stored);
      return stored;
    } catch {
      return null; // offline: keep the session
    }
  }
}
