# silverstripe-restful-framework-client

Client runtime for apps talking to a [silverstripe-restful-framework](https://github.com/brad-tipper/silverstripe-restful-framework) API. Opinionated: server state is **TanStack Query** (a required peer dependency) on top of a hey-api generated SDK.

- `SessionStore` - persists the access/refresh token pair; single-flight refresh (the server rotates refresh tokens).
- `configureApiClient` - points a generated hey-api client at the API, adds the bearer token, refreshes once on a 401.
- `unwrap` / `ApiError` - turns an SDK result into data or a typed problem+json error (`error.code`, `error.fieldError('password')`).
- `createApiQueryClient` - the fleet's `QueryClient` defaults (5 minute staleTime, no focus refetch, never retries a 4xx `ApiError`); pass overrides for offline-first apps.
- `createDefaultStorage` - expo-secure-store on devices, localStorage on web.
- `openapi-ts` preset - the shared hey-api config: `defineConfig(appOpenApiConfig({ input: "../x-api/openapi.json" }))`.
- `e2e` - Playwright helpers: `seedUsers`, `waitForEmail` (Mailpit), `totpCode`.

Ticket, contact and feedback hooks live in [service-desk-client](https://github.com/brad-tipper/service-desk-client).

The generated SDK lives in each app (`src/api/generated`) and is committed.

Install (public repo, pin a tag):

    npm i @tanstack/react-query github:brad-tipper/silverstripe-restful-framework-client#v0.1.0
