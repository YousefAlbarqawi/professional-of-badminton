/**
 * The composer's one form. BUILD-SPEC 15.11 and 6.2.
 *
 * One zod schema per form (2.1), and every message is an i18n key rather than
 * a sentence.
 *
 * The bounds are the column's: `length(trim(body)) BETWEEN 1 AND 2000`. The
 * counter on the screen counts the same characters the constraint does, so a
 * coach who is told he has room has room.
 *
 * The language is not in the schema. It is a segmented control over exactly
 * two values (D69, and 6.2's CHECK), so it is component state and cannot be
 * invalid.
 */
import { z } from 'zod';

/** 15.11: "a body field with a 2000 character counter". 6.2 is where it binds. */
export const ANNOUNCEMENT_MAX_LENGTH = 2000;

export const announcementSchema = z.object({
  body: z
    .string()
    .refine((value) => value.trim().length >= 1, { message: 'validation.announcementRequired' })
    .refine((value) => value.trim().length <= ANNOUNCEMENT_MAX_LENGTH, {
      message: 'validation.announcementTooLong',
    }),
});

export type AnnouncementFormValues = z.infer<typeof announcementSchema>;

/**
 * What the counter shows, and whether it has gone red.
 *
 * Trimmed, because that is what the database measures and what would be
 * stored. A coach who pads a message with newlines is not spending his
 * allowance on them.
 */
export function announcementLength(body: string): number {
  return body.trim().length;
}

export function isAnnouncementOverLength(body: string): boolean {
  return announcementLength(body) > ANNOUNCEMENT_MAX_LENGTH;
}
