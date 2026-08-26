/**
 * Token storage.
 *
 * CLAUDE.md: tokens live in expo-secure-store. No browser storage APIs.
 *
 * SecureStore is a key/value store with a size limit — values beyond roughly
 * 2 KB warn on Android and are not guaranteed to survive. A Supabase session is
 * two JWTs plus the user object and comfortably exceeds that, so values are
 * split across numbered keys and reassembled on read. The alternative,
 * splitting the session across AsyncStorage and keeping only the refresh token
 * secure, leaks the access token to unencrypted storage for no gain.
 */
import * as SecureStore from 'expo-secure-store';

/**
 * The slice of the AsyncStorage interface Supabase's auth client actually
 * calls. Narrower than the real thing on purpose: everything here has to work
 * on both platforms.
 */
export interface KeyValueStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * Well inside SecureStore's limit. The value is base64url JSON, so one
 * character is one byte and the character count is the byte count.
 */
export const CHUNK_SIZE = 1536;

/** An upper bound on chunks, so a corrupt marker cannot spin the reader. */
const MAX_CHUNKS = 64;

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

export function splitIntoChunks(value: string, size = CHUNK_SIZE): string[] {
  if (value === '') return [''];
  const chunks: string[] = [];
  for (let start = 0; start < value.length; start += size) {
    chunks.push(value.slice(start, start + size));
  }
  return chunks;
}

/**
 * Wraps a plain key/value store so that values of any size round-trip through
 * it. The marker at `key` holds the chunk count; the parts live at `key.0`
 * upwards.
 */
export function createChunkedStore(backend: KeyValueStore): KeyValueStore {
  async function removeChunks(key: string, count: number): Promise<void> {
    const removals: Promise<void>[] = [];
    for (let index = 0; index < count; index += 1) {
      removals.push(backend.removeItem(chunkKey(key, index)));
    }
    await Promise.all(removals);
  }

  async function readCount(key: string): Promise<number | null> {
    const marker = await backend.getItem(key);
    if (marker === null) return null;
    const count = Number.parseInt(marker, 10);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
    return count;
  }

  return {
    async getItem(key) {
      const count = await readCount(key);
      if (count === null) return null;

      const parts = await Promise.all(
        Array.from({ length: count }, (_unused, index) => backend.getItem(chunkKey(key, index))),
      );

      // A missing part means the write was interrupted or the store was
      // tampered with. A half a session is worse than none: clear it and let
      // the player sign in again.
      if (parts.some((part) => part === null)) {
        await removeChunks(key, count);
        await backend.removeItem(key);
        return null;
      }

      return parts.join('');
    },

    async setItem(key, value) {
      const previousCount = await readCount(key);
      const chunks = splitIntoChunks(value);

      await Promise.all(chunks.map((chunk, index) => backend.setItem(chunkKey(key, index), chunk)));
      await backend.setItem(key, String(chunks.length));

      // A shorter session than last time leaves parts behind that the next
      // read would never ask for but a curious reader still could.
      if (previousCount !== null && previousCount > chunks.length) {
        const stale: Promise<void>[] = [];
        for (let index = chunks.length; index < previousCount; index += 1) {
          stale.push(backend.removeItem(chunkKey(key, index)));
        }
        await Promise.all(stale);
      }
    },

    async removeItem(key) {
      const count = await readCount(key);
      if (count !== null) await removeChunks(key, count);
      await backend.removeItem(key);
    },
  };
}

/**
 * `AFTER_FIRST_UNLOCK` rather than the default, so the client can refresh a
 * token while the phone is locked. Without it a session silently expires in a
 * pocket and the player is signed out for no reason he can see.
 */
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const secureStoreBackend: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key, secureStoreOptions),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, secureStoreOptions),
  removeItem: (key) => SecureStore.deleteItemAsync(key, secureStoreOptions),
};

/** The store the Supabase client is given. */
export const secureTokenStore: KeyValueStore = createChunkedStore(secureStoreBackend);

/**
 * Wipes a key and every chunk under it. Sign out calls this after
 * `signOut()` so that nothing of the session is left behind, per the phase 2
 * requirement that signing out clears everything.
 */
export async function clearSecureKey(key: string): Promise<void> {
  await secureTokenStore.removeItem(key);
}
