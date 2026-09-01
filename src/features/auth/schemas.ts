/**
 * Form validation. BUILD-SPEC 14.2, 14.4 and 14.5.
 *
 * Every message here is an i18n key, not a sentence. The field renders
 * `t(error.message)`, so no English reaches a screen and Arabic needs no
 * parallel schema.
 *
 * Values are validated in their normalised form — email lowercased and
 * trimmed, phone with its spaces and dashes stripped — because that is what
 * reaches the server. `normaliseSignUp` applies the same normalisation before
 * submit, so what passed validation is what is sent.
 */
import { z } from 'zod';

import type { SignInInput, SignUpInput } from './types';

/** Deliberately loose. A real address is proven by the confirmation email. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Matches the profiles.phone CHECK in migration 0002 exactly. */
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

/** 14.2: minimum 8 characters, at least one letter and one digit. */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Spaces, dashes and brackets are how people type a number, not part of it. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, '');
}

export function normaliseName(raw: string): string {
  // Runs of inner whitespace collapse too, not just the ends: "عبد   الله"
  // and "Abd Allah" are the same name typed with a slower thumb, and the
  // profile row should not remember which.
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * What a name may be made of. Client instruction: first and family name accept
 * Arabic and English letters and nothing else — no digits, no punctuation, no
 * emoji.
 *
 * Three characters are allowed alongside the letters because excluding them
 * would reject real names rather than bad input: the space in "عبد الله" and
 * "Abu Bakr", and the hyphen and apostrophe in "Al-Khatib" and "D'Souza". Both
 * apostrophe forms are taken, because an iOS keyboard substitutes the curly
 * one as you type and the player cannot see the difference.
 *
 * The ranges, in order: Latin letters and their accented forms (a Jordanian
 * roster has "José" and "Müller" in it); the Arabic letters, hamza through
 * yeh, with the harakat that follow them — those are part of a spelling, not
 * decoration; and the extended Arabic letters. Arabic-Indic digits sit at
 * U+0660–U+0669, *between* two of those blocks, and are deliberately outside
 * every range here: "٦" is as much a digit as "6" and 16.1 wants neither in a
 * name. Tatweel (U+0640) is excluded for the same reason — it is a stretching
 * mark, not a letter.
 */
const NAME_PATTERN = /^[A-Za-z\u00C0-\u024F\u0621-\u063A\u0641-\u0652\u0671-\u06D3\s'\u2019-]+$/;

/** At least one actual letter — " - " is punctuation, not a name. */
const NAME_HAS_LETTER = /[A-Za-z\u00C0-\u024F\u0621-\u063A\u0641-\u064A\u0671-\u06D3]/;

function isName(value: string): boolean {
  const name = normaliseName(value);
  return NAME_PATTERN.test(name) && NAME_HAS_LETTER.test(name);
}

function hasNameLength(value: string): boolean {
  const length = normaliseName(value).length;
  return length >= 1 && length <= 50;
}

// The length check is first so that an empty field reports "required" rather
// than "letters only", which would be a strange thing to say about nothing.
const firstName = z
  .string()
  .refine(hasNameLength, { message: 'validation.firstNameRequired' })
  .refine(isName, { message: 'validation.firstNameLetters' });

const lastName = z
  .string()
  .refine(hasNameLength, { message: 'validation.lastNameRequired' })
  .refine(isName, { message: 'validation.lastNameLetters' });

const email = z.string().refine((value) => EMAIL_PATTERN.test(normaliseEmail(value)), {
  message: 'validation.emailInvalid',
});

const phone = z.string().refine((value) => PHONE_PATTERN.test(normalisePhone(value)), {
  message: 'validation.phoneInvalid',
});

const password = z.string().refine((value) => PASSWORD_PATTERN.test(value), {
  message: 'validation.passwordWeak',
});

/** 14.2: the five fields, in this order, plus the confirmation. */
export const signUpSchema = z
  .object({
    firstName,
    lastName,
    email,
    phone,
    password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

export type SignUpFormValues = z.infer<typeof signUpSchema>;

/**
 * 14.4: a wrong password and an unknown email are the same answer, so the sign
 * in form only checks that something was typed. Anything more would tell a
 * stranger which addresses exist.
 */
export const signInSchema = z.object({
  email: z.string().refine((value) => normaliseEmail(value).length > 0, {
    message: 'validation.emailInvalid',
  }),
  password: z.string().refine((value) => value.length > 0, {
    message: 'validation.passwordRequired',
  }),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

/** 14.5: an address, and nothing is disclosed about whether it is known. */
export const forgotPasswordSchema = z.object({ email });

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

/** 14.3: the *Change email* link returns to a small form. */
export const changeEmailSchema = z.object({ email });

export type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>;

/**
 * 14.3: the confirmation code. Six digits, because that is what
 * `auth.email.otp_length` in supabase/config.toml is set to. Normalised the
 * same way the other fields are — a player pasting from a mail app brings the
 * surrounding whitespace with him, and some clients insert a thin space
 * between the groups.
 */
const CODE_PATTERN = /^[0-9]{6}$/;

export function normaliseCode(raw: string): string {
  return raw.replace(/\s/g, '');
}

export const verifyCodeSchema = z.object({
  code: z.string().refine((value) => CODE_PATTERN.test(normaliseCode(value)), {
    message: 'validation.codeInvalid',
  }),
});

export type VerifyCodeFormValues = z.infer<typeof verifyCodeSchema>;

export function normaliseSignUp(values: SignUpFormValues): SignUpInput {
  return {
    firstName: normaliseName(values.firstName),
    lastName: normaliseName(values.lastName),
    email: normaliseEmail(values.email),
    phone: normalisePhone(values.phone),
    password: values.password,
  };
}

export function normaliseSignIn(values: SignInFormValues): SignInInput {
  return { email: normaliseEmail(values.email), password: values.password };
}
