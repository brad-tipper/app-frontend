// Node-side helpers for Playwright suites (not bundled into the app). Plain JS so the e2e runner
// (a .mjs script) can import it from node_modules; types are in index.d.mts.
import { createHmac } from "node:crypto";

/** Deletes every user and their data, then creates the fixture users. Keyed by lower-cased email. */
export async function seedUsers(config, users) {
  const response = await fetch(`${config.apiUrl}/v1/_e2e/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Secret": config.seedSecret },
    body: JSON.stringify({ users }),
  });
  if (!response.ok) {
    throw new Error(`E2E seed failed (${response.status}): ${await response.text()}`);
  }
  return await response.json();
}

/** Polls Mailpit until a message to `to` (optionally matching `subject`) arrives. */
export async function waitForEmail(config, to, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  const wanted = to.toLowerCase();
  while (Date.now() < deadline) {
    const list = await (await fetch(`${config.mailpitUrl}/api/v1/messages?limit=50`)).json();
    const hit = list.messages.find(
      (m) => m.To.some((t) => t.Address.toLowerCase() === wanted) && (!options.subject || options.subject.test(m.Subject)),
    );
    if (hit) {
      const full = await (await fetch(`${config.mailpitUrl}/api/v1/message/${hit.ID}`)).json();
      return { id: hit.ID, subject: hit.Subject, to: hit.To.map((t) => t.Address), text: full.Text };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No email to ${to} within the timeout.`);
}

/** The first URL in an email body. */
export function firstLink(message) {
  const match = message.text.match(/https?:\/\/\S+|[a-z][a-z0-9+.-]*:\/\/\S+/i);
  if (!match) throw new Error("No link found in the email.");
  return match[0];
}

export async function clearMailbox(config) {
  await fetch(`${config.mailpitUrl}/api/v1/messages`, { method: "DELETE" });
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  let bits = "";
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    bits += ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 code for a base32 secret (what an authenticator app would show). */
export function totpCode(secret, time = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[19] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/**
 * Sends the API a RevenueCat webhook event, the way RevenueCat would. Local runs cannot be
 * reached by RevenueCat's cloud, so the suite plays RevenueCat's part. `subscription` is
 * `{ secret, entitlement, productId, environment }` (environment: PRODUCTION locally, SANDBOX on a preview).
 */
let eventClock = Date.now();
export async function sendRevenueCatEvent(config, subscription, userId, type, extra = {}) {
  eventClock = Math.max(eventClock + 1000, Date.now());
  const event = {
    id: `${type}-${eventClock}-${Math.random().toString(36).slice(2)}`,
    type,
    app_user_id: userId,
    event_timestamp_ms: eventClock,
    environment: subscription.environment ?? "PRODUCTION",
    entitlement_ids: [subscription.entitlement],
    product_id: subscription.productId,
    expiration_at_ms: eventClock + 30 * 24 * 3600 * 1000,
    ...extra,
  };
  const response = await fetch(`${config.apiUrl}/v1/webhooks/revenuecat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${subscription.secret}` },
    body: JSON.stringify({ event }),
  });
  if (!response.ok) {
    throw new Error(`RevenueCat webhook ${type} failed (${response.status}): ${await response.text()}`);
  }
  return await response.json();
}

/**
 * Pays in RevenueCat's Web Billing sandbox checkout (Stripe test mode) with the 4242 test card.
 * Call it right after clicking the package button; resolves once "Payment complete" shows and the
 * checkout is dismissed. Stripe rejects reserved domains such as `.test`, so the email defaults to
 * a unique `example.com` address.
 */
export async function completeWebCheckout(page, email = `e2e.purchase.${Date.now()}@example.com`) {
  const fill = async (id, value) => {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      for (const frame of page.frames()) {
        const field = frame.locator(`#${id}`);
        if (await field.count().catch(() => 0)) {
          await field.fill(value);
          return;
        }
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`The checkout never showed the "${id}" field.`);
  };
  await fill("linkAuthentication-emailInput", email);
  await fill("payment-numberInput", "4242424242424242");
  await fill("payment-expiryInput", "1234");
  await fill("payment-cvcInput", "123");
  await page.getByRole("button", { name: /^(Start trial|Subscribe|Pay)/ }).click();
  await page.getByText("Payment complete").waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Continue" }).click();
}
