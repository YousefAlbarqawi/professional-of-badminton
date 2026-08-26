/**
 * Form schemas for the review screen. BUILD-SPEC 10.2, 10.3, 5.3.
 *
 * Money is typed in dinars, because that is what the coach says out loud, and
 * converted to fils by `fils()` at the boundary. 5.3: floats never touch money,
 * so the string is parsed once, converted once, and integer fils from there on.
 */
import { z } from 'zod';

import { fils, type Fils } from '@/lib/money';

/** Jordan quotes three decimal places. 5.3. */
const MONEY_PATTERN = /^\d+(\.\d{1,3})?$/;

/**
 * 10.2's *Partial*: "Opens a numeric input, prefilled with expected_fils.
 * Entering less creates a balance entry for the remainder."
 *
 * The maximum is the expected amount, because the server refuses more
 * (`invalid_amount`) and a form that lets him type it would only produce a
 * failure he could have been spared.
 */
export function partialPaymentSchema(expectedFils: Fils) {
  return z.object({
    amount: z
      .string()
      .trim()
      .refine((value) => MONEY_PATTERN.test(value), { message: 'validation.amountInvalid' })
      .refine((value) => fils(Number(value)) <= expectedFils, {
        message: 'validation.amountAboveExpected',
      }),
  });
}

export type PartialPaymentForm = { amount: string };

/**
 * 10.3's manual entry. A signed amount, because the same form records a debt
 * and a settlement, and a required note, because an unexplained number in a
 * ledger is worse than no number.
 */
export const balanceEntrySchema = z.object({
  amount: z
    .string()
    .trim()
    .refine((value) => MONEY_PATTERN.test(value.replace(/^-/, '')) && Number(value) !== 0, {
      message: 'validation.amountInvalid',
    }),
  note: z.string().trim().min(1, 'validation.noteRequired').max(200, 'validation.noteTooLong'),
});

export type BalanceEntryForm = z.infer<typeof balanceEntrySchema>;

/** Dinars typed into a field, as integer fils. Never a float past this point. */
export function toFils(amount: string): Fils {
  return fils(Number(amount.trim()));
}
