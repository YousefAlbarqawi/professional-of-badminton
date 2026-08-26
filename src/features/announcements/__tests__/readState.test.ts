/**
 * Read state is local to the device. BUILD-SPEC 14.11.
 *
 * The pure halves are what is worth asserting: a corrupted key must not stop
 * the tab opening, and the list must not grow forever on a phone that is never
 * reinstalled.
 */
import { addReadId, parseReadIds } from '../readState';

describe('parseReadIds', () => {
  it('reads a stored list', () => {
    expect(parseReadIds('["a","b"]')).toEqual(['a', 'b']);
  });

  it('treats a phone that has never opened the tab as having read nothing', () => {
    expect(parseReadIds(null)).toEqual([]);
  });

  it('survives a corrupted key', () => {
    // The cost of a bad value is a phone that forgets what it read. The cost
    // of throwing here would be a tab that will not open.
    expect(parseReadIds('not json')).toEqual([]);
    expect(parseReadIds('{"a":1}')).toEqual([]);
  });

  it('drops entries that are not ids', () => {
    expect(parseReadIds('["a",1,null,"b"]')).toEqual(['a', 'b']);
  });
});

describe('addReadId', () => {
  it('puts the newest first', () => {
    expect(addReadId(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('does not duplicate one that is already read', () => {
    expect(addReadId(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('caps the list so it cannot grow forever', () => {
    const many = Array.from({ length: 400 }, (_, index) => `id-${String(index)}`);
    const next = addReadId(many, 'newest');

    expect(next).toHaveLength(300);
    expect(next[0]).toBe('newest');
    // The oldest ids fall off, and they are older than anything the list
    // query returns, so nothing reachable is affected.
    expect(next).not.toContain('id-399');
  });
});
