export function appOpenApiConfig(options: { input: string; output?: string }): {
  input: string;
  output: { path: string; clean: boolean };
  plugins: ("@hey-api/typescript" | "@hey-api/sdk" | "@hey-api/client-fetch")[];
};
