/**
 * The two staff form schemas. 15.4 and 15.6.
 *
 * Every message is an i18n key, and the tests assert on the key rather than on
 * a sentence, because a sentence would only exist in one of the two languages.
 */
import { createSessionSchema, defaultRotationCount, editSessionSchema } from '../schemas';

const VALID_EDIT = {
  startTime: '19:00',
  priceJD: '6',
  courtCount: '4',
  notes: '',
};

const VALID_CREATE = {
  venueId: '11111111-1111-4111-8111-000000000001',
  sessionDate: '2026-08-24',
  startTime: '19:00',
  priceJD: '6.500',
  courtCount: '3',
  rotationCount: '4',
};

function firstIssue(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string {
  return result.error?.issues[0]?.message ?? '';
}

describe('editSessionSchema', () => {
  it('accepts a well-formed edit', () => {
    expect(editSessionSchema.safeParse(VALID_EDIT).success).toBe(true);
  });

  it.each(['7pm', '25:00', '19:60', '9:00', ''])('rejects the time %p', (startTime) => {
    const result = editSessionSchema.safeParse({ ...VALID_EDIT, startTime });
    expect(result.success).toBe(false);
    expect(firstIssue(result)).toBe('validation.timeInvalid');
  });

  it('accepts three decimal places on a price, as Jordan quotes', () => {
    expect(editSessionSchema.safeParse({ ...VALID_EDIT, priceJD: '6.250' }).success).toBe(true);
  });

  it('rejects a fourth decimal place', () => {
    const result = editSessionSchema.safeParse({ ...VALID_EDIT, priceJD: '6.2501' });
    expect(firstIssue(result)).toBe('validation.priceInvalid');
  });

  it('accepts a free session', () => {
    // D41 allows a zero rate, so a zero-priced session is not a typo.
    expect(editSessionSchema.safeParse({ ...VALID_EDIT, priceJD: '0' }).success).toBe(true);
  });

  it.each(['0', '21', '', 'four'])('rejects the court count %p', (courtCount) => {
    const result = editSessionSchema.safeParse({ ...VALID_EDIT, courtCount });
    expect(firstIssue(result)).toBe('validation.courtCountInvalid');
  });

  it('accepts both venues’ court counts', () => {
    // D1 and D3: Khalda 4, Shmeisani 3.
    expect(editSessionSchema.safeParse({ ...VALID_EDIT, courtCount: '3' }).success).toBe(true);
    expect(editSessionSchema.safeParse({ ...VALID_EDIT, courtCount: '4' }).success).toBe(true);
  });

  it('rejects a note over 500 characters', () => {
    const result = editSessionSchema.safeParse({ ...VALID_EDIT, notes: 'x'.repeat(501) });
    expect(firstIssue(result)).toBe('validation.notesTooLong');
  });
});

describe('createSessionSchema', () => {
  it('accepts a well-formed one-off', () => {
    expect(createSessionSchema.safeParse(VALID_CREATE).success).toBe(true);
  });

  it('requires a venue', () => {
    const result = createSessionSchema.safeParse({ ...VALID_CREATE, venueId: '' });
    expect(firstIssue(result)).toBe('validation.venueRequired');
  });

  it.each(['24-08-2026', '2026/08/24', 'tomorrow', ''])('rejects the date %p', (sessionDate) => {
    const result = createSessionSchema.safeParse({ ...VALID_CREATE, sessionDate });
    expect(firstIssue(result)).toBe('validation.dateInvalid');
  });

  it.each(['0', '11'])('rejects the rotation count %p', (rotationCount) => {
    const result = createSessionSchema.safeParse({ ...VALID_CREATE, rotationCount });
    expect(firstIssue(result)).toBe('validation.rotationCountInvalid');
  });

  it('allows a seventh rotation, which A15 says the coach may add', () => {
    expect(createSessionSchema.safeParse({ ...VALID_CREATE, rotationCount: '7' }).success).toBe(
      true,
    );
  });
});

describe('duration helpers', () => {
  it('gives 4 rotations to a standard session and 6 to an extended one', () => {
    // D5.
    expect(defaultRotationCount(90)).toBe(4);
    expect(defaultRotationCount(150)).toBe(6);
  });
});
