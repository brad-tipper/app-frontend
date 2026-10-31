import { describe, expect, it, vi } from "vitest";

import { configureApiClient } from "./client";
import { ApiError, unwrap } from "./errors";
import { SessionStore, type SessionStorage, type StoredSession } from "./session";

function memoryStorage(): SessionStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => void map.set(key, value),
    removeItem: async (key) => void map.delete(key),
  };
}

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const session = (n: number, expiresAt = future()): StoredSession => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  expiresAt,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("SessionStore", () => {
  it("persists and reloads a session", async () => {
    const storage = memoryStorage();
    const a = new SessionStore({ baseUrl: "http://api", storage });
    await a.set(session(1));
    const b = new SessionStore({ baseUrl: "http://api", storage });
    expect((await b.load())?.accessToken).toBe("access-1");
  });

  it("shares one refresh between concurrent callers and stores the rotated pair", async () => {
    const fetchMock = vi.fn(async () => json(session(2)));
    const store = new SessionStore({ baseUrl: "http://api", storage: memoryStorage(), fetch: fetchMock as never });
    await store.set(session(1));
    const [a, b] = await Promise.all([store.refresh(), store.refresh()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a?.accessToken).toBe("access-2");
    expect(b?.refreshToken).toBe("refresh-2");
    expect(store.get()?.refreshToken).toBe("refresh-2");
  });

  it("signs out when the refresh token is rejected, but keeps the session when offline", async () => {
    const rejected = new SessionStore({
      baseUrl: "http://api",
      storage: memoryStorage(),
      fetch: (async () => json({ code: "invalid_refresh_token" }, 401)) as never,
    });
    await rejected.set(session(1));
    expect(await rejected.refresh()).toBeNull();
    expect(rejected.get()).toBeNull();

    const offline = new SessionStore({
      baseUrl: "http://api",
      storage: memoryStorage(),
      fetch: (async () => {
        throw new TypeError("network");
      }) as never,
    });
    await offline.set(session(1));
    expect(await offline.refresh()).toBeNull();
    expect(offline.get()?.accessToken).toBe("access-1");
  });

  it("refreshes ahead of expiry when asked for a token", async () => {
    const fetchMock = vi.fn(async () => json(session(2)));
    const store = new SessionStore({ baseUrl: "http://api", storage: memoryStorage(), fetch: fetchMock as never });
    await store.set(session(1, new Date(Date.now() + 5_000).toISOString()));
    expect(await store.getAccessToken()).toBe("access-2");
  });
});

describe("configureApiClient", () => {
  it("adds the bearer token and retries once after a 401 with the refreshed token", async () => {
    const store = new SessionStore({
      baseUrl: "http://api",
      storage: memoryStorage(),
      fetch: (async () => json(session(2))) as never,
    });
    await store.set(session(1));

    const seen: string[] = [];
    const send = vi.fn(async (request: Request) => {
      seen.push(request.headers.get("Authorization") ?? "");
      return seen.length === 1 ? json({ code: "unauthorized" }, 401) : json({ ok: true });
    });
    let config: { fetch?: typeof fetch } = {};
    configureApiClient({
      client: { setConfig: (c) => (config = c) },
      baseUrl: "http://api/",
      session: store,
      fetch: send,
    });

    const response = await config.fetch!(
      new Request("http://api/v1/lists", { method: "POST", body: JSON.stringify({ a: 1 }), headers: { "Content-Type": "application/json" } }),
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual(["Bearer access-1", "Bearer access-2"]);
  });
});

describe("unwrap", () => {
  it("throws a typed ApiError from a problem document", async () => {
    const call = Promise.resolve({
      error: { code: "plan_limit", detail: "Free accounts are limited to 1 list(s).", status: 403 },
      response: new Response(null, { status: 403 }),
    });
    await expect(unwrap(call)).rejects.toMatchObject({ code: "plan_limit", status: 403 });
    await expect(unwrap(call)).rejects.toBeInstanceOf(ApiError);
  });

  it("returns data on success", async () => {
    const data = await unwrap(Promise.resolve({ data: { ok: true }, response: new Response("{}") }));
    expect(data).toEqual({ ok: true });
  });
});
