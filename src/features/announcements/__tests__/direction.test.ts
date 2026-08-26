/**
 * BUILD-SPEC 14.11: direction "detected per message rather than following the
 * app language".
 *
 * The interesting cases are the ones where the message does not start with a
 * letter, because that is what a coach actually types: a date, a time, an
 * emoji, a bullet.
 */
import { announcementDirection, detectTextDirection, directionStyle } from '../direction';

describe('detectTextDirection', () => {
  it('reads a plain Arabic message as right to left', () => {
    expect(detectTextDirection('تدريب الجمعة ألغي')).toBe('rtl');
  });

  it('reads a plain English message as left to right', () => {
    expect(detectTextDirection('Friday session is cancelled')).toBe('ltr');
  });

  it('skips digits and finds the first strong character', () => {
    expect(detectTextDirection('2026 تدريب')).toBe('rtl');
    expect(detectTextDirection('19:00 Khalda')).toBe('ltr');
  });

  it('skips punctuation, whitespace and emoji', () => {
    expect(detectTextDirection('  — ⚠️ ملاحظة')).toBe('rtl');
    expect(detectTextDirection('*** Note')).toBe('ltr');
  });

  it('takes the first strong character, not the majority', () => {
    // A notice written in Arabic that opens with the venue's English name.
    expect(detectTextDirection('Khalda: التدريب اليوم في القاعة الكبيرة')).toBe('ltr');
    expect(detectTextDirection('التدريب اليوم at Khalda')).toBe('rtl');
  });

  it('returns null when nothing in the message is directional', () => {
    expect(detectTextDirection('19:00 — 20:30')).toBeNull();
    expect(detectTextDirection('🏸🏸🏸')).toBeNull();
    expect(detectTextDirection('')).toBeNull();
  });
});

describe('announcementDirection', () => {
  it('follows the message rather than the declared language', () => {
    // D69 lets him pick a language on the composer and then type another. The
    // message is what the reader sees, so the message is what decides.
    expect(announcementDirection('Session cancelled', 'ar')).toBe('ltr');
    expect(announcementDirection('التدريب ألغي', 'en')).toBe('rtl');
  });

  it('falls back to the declared language when there is nothing to read', () => {
    expect(announcementDirection('19:00', 'en')).toBe('ltr');
    expect(announcementDirection('19:00', 'ar')).toBe('rtl');
  });
});

describe('directionStyle', () => {
  it('aligns a right to left message to the right', () => {
    expect(directionStyle('rtl')).toEqual({ writingDirection: 'rtl', textAlign: 'right' });
  });

  it('aligns a left to right message to the left', () => {
    // 14.11's whole point: an English notice must not dangle on the right of
    // an Arabic screen.
    expect(directionStyle('ltr')).toEqual({ writingDirection: 'ltr', textAlign: 'left' });
  });
});
