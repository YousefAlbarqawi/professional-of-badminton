/**
 * Form validation for the two staff session forms. 15.4 and 15.6.
 *
 * One zod schema per form (2.1). Every message is an i18n key, not a sentence,
 * so the field renders `t(error.message)` and Arabic needs no parallel schema.
 *
 * Every field is a string, because every field is a text input and a
 * half-typed "6." has to survive until the coach finishes typing it. The
 * conversion to fils and to integers happens once, at submit. Money is never a
 * float in flight: `fils()` rounds half-to-even into an integer count. 5.3.
 *
 * The duration is not in either schema. It is a segmented control over exactly
 * two values (D5), so it is component state and cannot be invalid.
 */
import { z } from 'zod';

/** D5: two session types only, and the duration is what picks between them. */
export const DURATIONS = [90, 150] as const;
export type DurationMinutes = (typeof DURATIONS)[number];

/** `HH:mm`, 24 hour. What the field holds and what Postgres takes. */
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** `yyyy-MM-dd`, an Amman calendar day. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Dinars, up to the three decimal places Jordan quotes. 5.3. */
const MONEY_PATTERN = /^\d{1,4}(\.\d{1,3})?$/;

const COUNT_PATTERN = /^\d{1,2}$/;

function isCountBetween(value: string, min: number, max: number): boolean {
  if (!COUNT_PATTERN.test(value)) return false;
  const count = Number(value);
  return count >= min && count <= max;
}

const startTime = z.string().refine((value) => TIME_PATTERN.test(value.trim()), {
  message: 'validation.timeInvalid',
});

const priceJD = z.string().refine((value) => MONEY_PATTERN.test(value.trim()), {
  message: 'validation.priceInvalid',
});

/** Capacity is court_count x 4, and the table caps the count at 20. 5.4, 6.2. */
const courtCount = z.string().refine((value) => isCountBetween(value.trim(), 1, 20), {
  message: 'validation.courtCountInvalid',
});

/** 6.2: rotation_count is between 1 and 10. A15 allows a seventh by hand. */
const rotationCount = z.string().refine((value) => isCountBetween(value.trim(), 1, 10), {
  message: 'validation.rotationCountInvalid',
});

const sessionDate = z.string().refine((value) => DATE_PATTERN.test(value.trim()), {
  message: 'validation.dateInvalid',
});

/** 15.4: start time, duration, price, court count, notes. Nothing else. */
export const editSessionSchema = z.object({
  startTime,
  priceJD,
  courtCount,
  notes: z.string().refine((value) => value.length <= 500, {
    message: 'validation.notesTooLong',
  }),
});

export type EditSessionForm = z.infer<typeof editSessionSchema>;

/** 15.6: venue, date, start time, duration, price, court count, rotations. */
export const createSessionSchema = z.object({
  venueId: z.string().refine((value) => value.trim() !== '', {
    message: 'validation.venueRequired',
  }),
  sessionDate,
  startTime,
  priceJD,
  courtCount,
  rotationCount,
});

export type CreateSessionForm = z.infer<typeof createSessionSchema>;

/** D5 again, on the client, so the form can follow the duration. */
export function defaultRotationCount(minutes: DurationMinutes): number {
  return minutes === 150 ? 6 : 4;
}
