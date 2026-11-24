import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

import { isApiError } from "./api/errors";

/**
 * Retry policy for API calls: never retry a request the server understood and rejected (any 4xx - bad input,
 * 401, plan limit, 404 will not change on a second try), retry network failures and 5xx once.
 */
export function shouldRetryApiError(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

/**
 * The fleet's TanStack Query client: low-churn data (every mutation invalidates its own queries), so a five
 * minute staleTime and no refetch on focus, with the API-aware retry above. Pass `overrides` to tune an app
 * (offline-first apps set `networkMode: "offlineFirst"` and a longer `staleTime`/`gcTime`).
 */
export function createApiQueryClient(overrides: QueryClientConfig = {}): QueryClient {
  const { defaultOptions, ...rest } = overrides;
  return new QueryClient({
    ...rest,
    defaultOptions: {
      ...defaultOptions,
      queries: {
        staleTime: 5 * 60_000,
        retry: shouldRetryApiError,
        refetchOnWindowFocus: false,
        networkMode: "online",
        ...defaultOptions?.queries,
      },
      mutations: {
        retry: 0,
        networkMode: "online",
        ...defaultOptions?.mutations,
      },
    },
  });
}
