import { useMutation } from "@tanstack/react-query";

import { unwrap } from "../api/errors";

export type FeedbackType = "praise" | "bug" | "feature";

export type FeedbackInput = {
  name: string;
  email: string;
  type: FeedbackType;
  subject?: string;
  message: string;
  /** Where the user was: a screen path in the app, or a page URL on the web. */
  pageUrl: string;
};

export type ContactInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  pageUrl: string;
  /** Cloudflare Turnstile token; web only (signed-out visitors). */
  turnstileToken?: string;
};

export const FEEDBACK_TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: "praise", label: "Praise" },
  { value: "bug", label: "Problem" },
  { value: "feature", label: "Idea" },
];

export const CONTACT_LIMITS = { name: 255, subject: 255, message: 10000 } as const;

/**
 * The part of an app's generated SDK the contact hooks call. Pass `api` from `~/api/client`.
 * Sending consent is implied by the user pressing Send on a form that says so, so the hooks send `gdprConsent: true`.
 */
export interface ContactSdk {
  submitContact(options: { body: ContactInput & { gdprConsent: boolean } }): PromiseLike<any>;
  submitFeedback(options: { body: FeedbackInput & { gdprConsent: boolean } }): PromiseLike<any>;
}

/**
 * Mutation hooks for the contact and feedback endpoints. Create them once per app:
 *
 *   export const { useSendContact, useSendFeedback } = createContactHooks(api);
 *
 * Feedback is for signed-in users (no captcha: the API skips it when a valid access token is sent). Contact is the
 * signed-out form, so on the web pass the Turnstile token.
 */
export function createContactHooks(sdk: ContactSdk) {
  function useSendContact() {
    return useMutation({
      mutationFn: async (input: ContactInput) =>
        unwrap(sdk.submitContact({ body: { ...input, gdprConsent: true } })),
    });
  }

  function useSendFeedback() {
    return useMutation({
      mutationFn: async (input: FeedbackInput) =>
        unwrap(sdk.submitFeedback({ body: { ...input, gdprConsent: true } })),
    });
  }

  return { useSendContact, useSendFeedback };
}
