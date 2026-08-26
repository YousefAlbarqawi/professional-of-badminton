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
  return raw.trim();
}

const firstName = z
  .string()
  .refine((value) => normaliseName(value).length >= 1 && normaliseName(value).length <= 50, {
    message: 'validation.firstNameRequired',
  });

const lastName = z
  .string()
  .refine((value) => normaliseName(value).length >= 1 && normaliseName(value).length <= 50, {
    message: 'validation.lastNameRequired',
  });

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
