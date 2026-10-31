import type { SessionStore } from "./session";

/** The part of a hey-api generated client this package needs. */
export interface ApiClientLike {
  setConfig(config: { baseUrl?: string; fetch?: typeof fetch; headers?: Record<string, string> }): unknown;
}

export type ConfigureApiClientOptions = {
  client: ApiClientLike;
  /** API origin, e.g. `https://api.taskscribe.app` (no trailing slash). */
  baseUrl: string;
  session: SessionStore;
  /** Underlying transport (defaults to global fetch). */
  fetch?: (request: Request) => Promise<Response>;
};

/**
 * Points a generated hey-api client at the API and gives it the session:
 * every request carries the bearer token, and a 401 triggers exactly one
 * refresh-and-retry. If the refresh is rejected the session is cleared, which
 * subscribers (the app's auth provider) see as a sign-out.
 */
export function configureApiClient({ client, baseUrl, session, fetch: baseFetch }: ConfigureApiClientOptions) {
  const send = baseFetch ?? ((request: Request) => fetch(request));

  const authedFetch = async (input: Request): Promise<Response> => {
    const retryable = input.clone();
    const token = await session.getAccessToken();
    if (token) input.headers.set("Authorization", `Bearer ${token}`);

    const response = await send(input);
    if (response.status !== 401 || !token) return response;

    const refreshed = await session.refresh();
    if (!refreshed) return response;
    retryable.headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
    return send(retryable);
  };

  client.setConfig({
    baseUrl: baseUrl.replace(/\/+$/, ""),
    fetch: authedFetch as typeof fetch,
  });
}
