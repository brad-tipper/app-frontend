export type SeedUser = {
  email: string;
  password: string;
  name: string;
  tier?: "free" | "pro";
  /** Create the user with TOTP two-factor enabled; the secret and recovery codes come back. */
  totp?: boolean;
  preferences?: Record<string, unknown>;
};

export type SeedResult = { id: string; totpSecret?: string; recoveryCodes?: string[] };

export type E2eConfig = {
  /** API origin, e.g. `https://taskscribe-api.ddev.site`. */
  apiUrl: string;
  /** Must match the API's E2E_SEED_SECRET (dev environments only). */
  seedSecret: string;
  /** Mailpit origin, e.g. `https://taskscribe-api.ddev.site:8026`. */
  mailpitUrl: string;
};

export type MailMessage = { id: string; subject: string; to: string[]; text: string };

export function seedUsers(config: E2eConfig, users: SeedUser[]): Promise<Record<string, SeedResult>>;
export function waitForEmail(
  config: E2eConfig,
  to: string,
  options?: { subject?: RegExp; timeoutMs?: number },
): Promise<MailMessage>;
export function firstLink(message: MailMessage): string;
export function clearMailbox(config: E2eConfig): Promise<void>;
export function totpCode(secret: string, time?: number): string;
