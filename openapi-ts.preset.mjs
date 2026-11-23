// Shared hey-api configuration. In an app's openapi-ts.config.ts:
//
//   import { defineConfig } from "@hey-api/openapi-ts";
//   import { appOpenApiConfig } from "@brad-tipper/app-frontend/openapi-ts";
//   export default defineConfig(appOpenApiConfig({ input: "../taskscribe-api/openapi.json" }));
//
// The generated SDK is committed in the app (src/api/generated) so builds never
// need the API repo checked out.

/**
 * @param {{ input: string, output?: string }} options
 */
export function appOpenApiConfig({ input, output = "src/api/generated" }) {
  return {
    input,
    output: { path: output, clean: true },
    plugins: ["@hey-api/typescript", "@hey-api/sdk", "@hey-api/client-fetch"],
  };
}
