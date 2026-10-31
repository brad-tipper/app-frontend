import type { SessionStorage } from "./api/session";

/**
 * Picks the right storage for the platform: expo-secure-store on iOS/Android,
 * localStorage on web. Loaded lazily so a web or test bundle never pulls in
 * native modules.
 */
export function createDefaultStorage(): SessionStorage {
  const isWeb = typeof document !== "undefined";

  if (isWeb) {
    return {
      async getItem(key) {
        try {
          return globalThis.localStorage?.getItem(key) ?? null;
        } catch {
          return null;
        }
      },
      async setItem(key, value) {
        try {
          globalThis.localStorage?.setItem(key, value);
        } catch {
          // Storage can be unavailable (private mode); the session then lasts for the page only.
        }
      },
      async removeItem(key) {
        try {
          globalThis.localStorage?.removeItem(key);
        } catch {
          // ignore
        }
      },
    };
  }

  // SecureStore keys may only contain alphanumerics, ".", "-" and "_".
  const secure = () => import("expo-secure-store");
  return {
    async getItem(key) {
      return (await secure()).getItemAsync(key);
    },
    async setItem(key, value) {
      await (await secure()).setItemAsync(key, value);
    },
    async removeItem(key) {
      await (await secure()).deleteItemAsync(key);
    },
  };
}
