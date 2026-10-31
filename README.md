# app-frontend

Shared client runtime for the app fleet's Silverstripe APIs (see [app-backend](https://github.com/brad-tipper/app-backend)).

- `SessionStore` - persists the access/refresh token pair; single-flight refresh (the server rotates refresh tokens).
- `configureApiClient` - points a generated hey-api client at the API, adds the bearer token, refreshes once on a 401.
- `unwrap` / `ApiError` - turns an SDK result into data or a typed problem+json error (`error.code`, `error.fieldError('password')`).
- `createDefaultStorage` - expo-secure-store on devices, localStorage on web.
- `openapi-ts` preset - the shared hey-api config: `defineConfig(appOpenApiConfig({ input: "../x-api/openapi.json" }))`.
- `e2e` - Playwright helpers: `seedUsers`, `waitForEmail` (Mailpit), `totpCode`.

The generated SDK lives in each app (`src/api/generated`) and is committed.

Install in an app: `npm i github:brad-tipper/app-frontend` (private; uses your git credentials).
