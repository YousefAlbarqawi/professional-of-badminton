/**
 * Form schemas for 15.9 and 15.10.
 *
 * Every rule here has a twin in migration 0029, and the server's is the one
 * that decides. These exist so the coach is told what is wrong while he is
 * still typing, rather than after a round trip — and so the *Save* button is
 * disabled on exactly the states the server would refuse.
 */
import { z } from 'zod';

/** `yyyy-MM-dd`, an Amman calendar day. A35: the coach types dates. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dayKey = z.string().refine((value) => DATE_PATTERN.test(value.trim()), {
  message: 'validation.dateInvalid',
});

/**
 * 15.9: "Package picker ... Start date defaulting to today. Expiry auto-filled
 * and editable. Visit count override. Note field."
 *
 * The note is optional here and required in `adjustCreditsSchema`, which is
 * the difference 11.2 and 11.3 draw between them: a grant explains itself
 * (a package, a date, a count), an adjustment does not.
 *
 * `expiresOn > startsOn` matches the CHECK on `player_subscriptions` and
 * `grant_subscription`'s own guard. A one-day subscription is legal and a
 * zero-day one is not, which is the table's rule, not a new one.
 */
export const grantSubscriptionSchema = z
  .object({
    packageId: z.string().min(1, 'validation.packageRequired'),
    startsOn: dayKey,
    expiresOn: dayKey,
    visits: z
      .string()
      .trim()
      .refine((value) => /^\d+$/.test(value) && Number(value) > 0, {
        message: 'validation.visitCountInvalid',
      }),
    note: z.string().trim().max(200, 'validation.noteTooLong'),
  })
  .refine((value) => value.expiresOn.trim() > value.startsOn.trim(), {
    message: 'validation.expiryBeforeStart',
    path: ['expiresOn'],
  });

export type GrantSubscriptionForm = z.infer<typeof grantSubscriptionSchema>;

/**
 * 15.10: "Subscription picker, signed amount, required note, and a preview."
 *
 * The amount is a signed integer of *credits*, not money. A credit is one
 * visit (D52); what it is worth in dinars is the subscription's snapshotted
 * per-visit rate and is nothing the coach types here.
 *
 * Zero is refused for the same reason the column carries CHECK (delta <> 0):
 * a ledger row that moves nothing is a row that says only that somebody
 * touched the screen.
 */
export const adjustCreditsSchema = z.object({
  subscriptionId: z.string().min(1, 'validation.subscriptionRequired'),
  delta: z
    .string()
    .trim()
    .refine((value) => /^-?\d+$/.test(value) && Number(value) !== 0, {
      message: 'validation.creditDeltaInvalid',
    }),
  // 11.3 and D56. The server refuses a blank one as `note_required`; this is
  // so he never gets that far.
  note: z.string().trim().min(1, 'validation.noteRequired').max(200, 'validation.noteTooLong'),
});

export type AdjustCreditsForm = z.infer<typeof adjustCreditsSchema>;

/** 11.5: extending moves the expiry date forward, and only forward. */
export function extendSubscriptionSchema(currentExpiresOn: string) {
  return z.object({
    expiresOn: dayKey.refine((value) => value.trim() > currentExpiresOn, {
      message: 'validation.expiryNotLater',
    }),
  });
}
