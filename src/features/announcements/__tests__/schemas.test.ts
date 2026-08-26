/**
 * The composer's bounds are 6.2's column constraint, restated.
 * BUILD-SPEC 15.11 and 6.2.
 */
import {
  announcementLength,
  announcementSchema,
  isAnnouncementOverLength,
  ANNOUNCEMENT_MAX_LENGTH,
} from '../schemas';

const parse = (body: string): { ok: boolean; message?: string } => {
  const result = announcementSchema.safeParse({ body });
  return result.success
    ? { ok: true }
    : { ok: false, message: result.error.issues[0]?.message ?? '' };
};

describe('announcementSchema', () => {
  it('accepts an ordinary message', () => {
    expect(parse('Friday is cancelled.')).toEqual({ ok: true });
  });

  it('rejects an empty body with a key, not a sentence', () => {
    expect(parse('')).toEqual({ ok: false, message: 'validation.announcementRequired' });
  });

  it('rejects whitespace, because the column measures the trimmed length', () => {
    expect(parse('   \n  ')).toEqual({ ok: false, message: 'validation.announcementRequired' });
  });

  it('accepts exactly 2000 characters', () => {
    expect(parse('x'.repeat(ANNOUNCEMENT_MAX_LENGTH))).toEqual({ ok: true });
  });

  it('rejects 2001', () => {
    expect(parse('x'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1))).toEqual({
      ok: false,
      message: 'validation.announcementTooLong',
    });
  });

  it('does not count surrounding whitespace against the limit', () => {
    // The database trims before it measures, so the counter must too, or the
    // coach is told he is over when the server would accept it.
    const body = `  ${'x'.repeat(ANNOUNCEMENT_MAX_LENGTH)}  `;
    expect(parse(body)).toEqual({ ok: true });
  });
});

describe('the counter', () => {
  it('counts the characters the constraint counts', () => {
    expect(announcementLength('  hello  ')).toBe(5);
  });

  it('turns over at 2001', () => {
    expect(isAnnouncementOverLength('x'.repeat(ANNOUNCEMENT_MAX_LENGTH))).toBe(false);
    expect(isAnnouncementOverLength('x'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1))).toBe(true);
  });
});
