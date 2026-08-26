/**
 * The chunked token store. A Supabase session is bigger than SecureStore's
 * value limit, so this is the thing standing between a signed-in player and
 * being signed out at random on Android.
 */
import { CHUNK_SIZE, createChunkedStore, splitIntoChunks } from '../secureStorage';
import type { KeyValueStore } from '../secureStorage';

function fakeBackend(): KeyValueStore & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async (key) => {
      store.delete(key);
    },
  };
}

const KEY = 'sb-127-0-0-1-auth-token';

describe('splitIntoChunks', () => {
  it('keeps a short value in one piece', () => {
    expect(splitIntoChunks('abc')).toEqual(['abc']);
  });

  it('splits on the boundary, not near it', () => {
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 7);
    const chunks = splitIntoChunks(value);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(CHUNK_SIZE);
    expect(chunks[2]).toHaveLength(7);
    expect(chunks.join('')).toBe(value);
  });

  it('represents the empty string as one empty chunk', () => {
    expect(splitIntoChunks('')).toEqual(['']);
  });
});

describe('createChunkedStore', () => {
  it('round-trips a value larger than the chunk size', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);
    const session = JSON.stringify({ access_token: 'a'.repeat(4000), refresh_token: 'b' });

    await store.setItem(KEY, session);

    expect(await store.getItem(KEY)).toBe(session);
  });

  it('never writes a single value above the chunk size', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);

    await store.setItem(KEY, 'z'.repeat(CHUNK_SIZE * 3));

    for (const [key, value] of backend.store) {
      if (key === KEY) continue;
      expect(value.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });

  it('returns null for a key that was never written', async () => {
    const store = createChunkedStore(fakeBackend());
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('drops stale chunks when a shorter value replaces a longer one', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);

    await store.setItem(KEY, 'a'.repeat(CHUNK_SIZE * 3));
    await store.setItem(KEY, 'short');

    expect(await store.getItem(KEY)).toBe('short');
    expect(backend.store.has(`${KEY}.1`)).toBe(false);
    expect(backend.store.has(`${KEY}.2`)).toBe(false);
  });

  it('treats a half-written value as no value and clears it', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);

    await store.setItem(KEY, 'a'.repeat(CHUNK_SIZE * 2));
    backend.store.delete(`${KEY}.1`);

    expect(await store.getItem(KEY)).toBeNull();
    // Nothing of the broken session is left for a later read to half-restore.
    expect(backend.store.size).toBe(0);
  });

  it('ignores a marker that is not a plausible chunk count', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);

    await backend.setItem(KEY, 'not-a-number');
    expect(await store.getItem(KEY)).toBeNull();

    await backend.setItem(KEY, '9999');
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('removes every chunk on removeItem, so sign out leaves nothing', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);

    await store.setItem(KEY, 'a'.repeat(CHUNK_SIZE * 4));
    await store.removeItem(KEY);

    expect(backend.store.size).toBe(0);
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('keeps two keys apart', async () => {
    const backend = fakeBackend();
    const store = createChunkedStore(backend);

    await store.setItem('one', 'a'.repeat(CHUNK_SIZE + 1));
    await store.setItem('two', 'b');

    expect(await store.getItem('one')).toBe('a'.repeat(CHUNK_SIZE + 1));
    expect(await store.getItem('two')).toBe('b');
  });
});
