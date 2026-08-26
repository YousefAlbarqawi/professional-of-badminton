/**
 * Form validation for 15.2's add-guest form. One zod schema per form (2.1),
 * every message an i18n key rather than a sentence.
 *
 * The guest form is the only one in phase 4 with a free text field. Add player
 * is a search and a choice, and add coach is a picker and a toggle; neither can
 * hold an invalid value, so neither has a schema.
 *
 * The amount is a string for the same reason the session forms' price is: a
 * half-typed "6." has to survive until the coach has finished typing it, and
 * the conversion to fils happens once, at submit. 5.3.
 */
import { z } from 'zod';

import { TIERS } from '@/lib/tiers';

/** Dinars, up to the three decimal places Jordan quotes. 5.3. */
const MONEY_PATTERN = /^\d{1,4}(\.\d{1,3})?$/;

export const addGuestSchema = z
  .object({
    // D44: name and tier only. 6.2 caps a guest name the same way it caps a
    // player's, and a name of spaces is not a name.
    guestName: z.string().refine((value) => value.trim().length >= 1 && value.trim().length <= 50, {
      message: 'validation.guestNameRequired',
    }),
    guestTier: z.enum(TIERS),
    // D45: paid with an amount, or free at zero.
    isFree: z.boolean(),
    amountJD: z.string(),
  })
  .refine((form) => form.isFree || MONEY_PATTERN.test(form.amountJD.trim()), {
    message: 'validation.priceInvalid',
    path: ['amountJD'],
  });

export type AddGuestForm = z.infer<typeof addGuestSchema>;

/** 15.2: the search runs from two characters. The server agrees. */
export const MIN_SEARCH_LENGTH = 2;

/** Long enough that the coach has stopped typing, short enough to feel live. */
export const SEARCH_DEBOUNCE_MS = 300;

export function isSearchable(query: string): boolean {
  return query.trim().length >= MIN_SEARCH_LENGTH;
}
