// Node-side helpers for Playwright suites (not bundled into the app).
import { createHmac } from "node:crypto";

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

/** Deletes every user and their data, then creates the fixture users. Keyed by lower-cased email. */
export async function seedUsers(config: E2eConfig, users: SeedUser[]): Promise<Record<string, SeedResult>> {
  const response = await fetch(`${config.apiUrl}/v1/_e2e/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Secret": config.seedSecret },
    body: JSON.stringify({ users }),
  });
  if (!response.ok) {
    throw new Error(`E2E seed failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as Record<string, SeedResult>;
}

export type MailMessage = { id: string; subject: string; to: string[]; text: string };

/** Polls Mailpit until a message to `to` (optionally matching `subject`) arrives. */
export async function waitForEmail(
  config: E2eConfig,
  to: string,
  options: { subject?: RegExp; timeoutMs?: number } = {},
): Promise<MailMessage> {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  const wanted = to.toLowerCase();
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${config.mailpitUrl}/api/v1/messages?limit=50`)).json()) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    const hit = list.messages.find(
      (m) => m.To.some((t) => t.Address.toLowerCase() === wanted) && (!options.subject || options.subject.test(m.Subject)),
    );
    if (hit) {
      const full = (await (await fetch(`${config.mailpitUrl}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
      return { id: hit.ID, subject: hit.Subject, to: hit.To.map((t) => t.Address), text: full.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No email to ${to} within the timeout.`);
}

/** The first URL in an email body. */
export function firstLink(message: MailMessage): string {
  const match = message.text.match(/https?:\/\/\S+|[a-z][a-z0-9+.-]*:\/\/\S+/i);
  if (!match) throw new Error("No link found in the email.");
  return match[0];
}

export async function clearMailbox(config: E2eConfig): Promise<void> {
  await fetch(`${config.mailpitUrl}/api/v1/messages`, { method: "DELETE" });
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    bits += ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 code for a base32 secret (what an authenticator app would show). */
export function totpCode(secret: string, time = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = (hmac[19] ?? 0) & 0xf;
  const code =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    ((hmac[offset + 1] ?? 0) << 16) |
    ((hmac[offset + 2] ?? 0) << 8) |
    (hmac[offset + 3] ?? 0);
  return String(code % 1_000_000).padStart(6, "0");
}
