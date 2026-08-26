/**
 * Every validation rule in BUILD-SPEC 14.2, and the normalisation the server
 * relies on. A rule that passes here and fails in Postgres would show the
 * player a generic error instead of the specific one the table promises.
 */
import {
  changeEmailSchema,
  forgotPasswordSchema,
  normaliseEmail,
  normalisePhone,
  normaliseSignIn,
  normaliseSignUp,
  signInSchema,
  signUpSchema,
  type SignUpFormValues,
} from '../schemas';

/** The CHECK on profiles.phone, from migration 0002. */
const SERVER_PHONE_CHECK = /^\+?[0-9]{9,15}$/;

const VALID: SignUpFormValues = {
  firstName: 'Yousef',
  lastName: 'Alkhatib',
  email: 'Yousef@Example.COM ',
  phone: '079 123 4567',
  password: 'badminton1',
  confirmPassword: 'badminton1',
};

function messageFor(values: SignUpFormValues, field: keyof SignUpFormValues): string | undefined {
  const result = signUpSchema.safeParse(values);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe('sign up validation', () => {
  it('accepts a complete, well formed sign up', () => {
    expect(signUpSchema.safeParse(VALID).success).toBe(true);
  });

  describe('first name, 1 to 50 characters after trim', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'whitespace only'],
      ['x'.repeat(51), 'over 50'],
    ])('rejects %s (%s)', (firstName) => {
      expect(messageFor({ ...VALID, firstName }, 'firstName')).toBe('validation.firstNameRequired');
    });

    it('accepts exactly 50 characters', () => {
      expect(signUpSchema.safeParse({ ...VALID, firstName: 'x'.repeat(50) }).success).toBe(true);
    });

    it('counts the trimmed length, not the typed one', () => {
      expect(signUpSchema.safeParse({ ...VALID, firstName: '  Ali  ' }).success).toBe(true);
      expect(signUpSchema.safeParse({ ...VALID, firstName: ` ${'x'.repeat(51)} ` }).success).toBe(
        false,
      );
    });
  });

  it('reports the last name against its own key', () => {
    expect(messageFor({ ...VALID, lastName: '' }, 'lastName')).toBe('validation.lastNameRequired');
  });

  describe('email', () => {
    it.each(['', 'nope', 'a@b', 'a b@example.com', '@example.com', 'a@@example.com'])(
      'rejects %p',
      (email) => {
        expect(messageFor({ ...VALID, email }, 'email')).toBe('validation.emailInvalid');
      },
    );

    it.each(['player@example.com', 'PLAYER@EXAMPLE.COM', ' player+tag@sub.example.co '])(
      'accepts %p',
      (email) => {
        expect(signUpSchema.safeParse({ ...VALID, email }).success).toBe(true);
      },
    );
  });

  describe('phone, 9 to 15 digits with an optional leading plus', () => {
    it.each(['', '12345678', '1234567890123456', '+962-79-abc', '079 12'])(
      'rejects %p',
      (phone) => {
        expect(messageFor({ ...VALID, phone }, 'phone')).toBe('validation.phoneInvalid');
      },
    );

    it.each(['0791234567', '+962791234567', '079-123-4567', '(079) 123 4567', '123456789'])(
      'accepts %p and normalises it to something the server accepts',
      (phone) => {
        expect(signUpSchema.safeParse({ ...VALID, phone }).success).toBe(true);
        expect(normalisePhone(phone)).toMatch(SERVER_PHONE_CHECK);
      },
    );
  });

  describe('password, 8 or more with a letter and a digit', () => {
    it.each([
      ['short1', 'under 8'],
      ['lettersonly', 'no digit'],
      ['12345678', 'no letter'],
      ['', 'empty'],
    ])('rejects %p (%s)', (password) => {
      expect(messageFor({ ...VALID, password, confirmPassword: password }, 'password')).toBe(
        'validation.passwordWeak',
      );
    });

    it.each(['badminton1', 'a1234567', 'P@ssw0rd!'])('accepts %p', (password) => {
      expect(
        signUpSchema.safeParse({ ...VALID, password, confirmPassword: password }).success,
      ).toBe(true);
    });
  });

  it('reports a mismatch against the confirmation field', () => {
    expect(messageFor({ ...VALID, confirmPassword: 'different1' }, 'confirmPassword')).toBe(
      'validation.passwordMismatch',
    );
  });
});

describe('normalisation', () => {
  it('lowercases and trims the email before submit', () => {
    expect(normaliseEmail('  Player@Example.COM ')).toBe('player@example.com');
  });

  it('strips spaces, dashes and brackets from the phone', () => {
    expect(normalisePhone(' (079) 123-4567 ')).toBe('0791234567');
    expect(normalisePhone('+962 79 123 4567')).toBe('+962791234567');
  });

  it('sends exactly the five fields D11 names', () => {
    expect(normaliseSignUp(VALID)).toEqual({
      firstName: 'Yousef',
      lastName: 'Alkhatib',
      email: 'yousef@example.com',
      phone: '0791234567',
      password: 'badminton1',
    });
  });

  it('leaves the password untouched, spaces and all', () => {
    const spaced = { ...VALID, password: ' pass word1 ', confirmPassword: ' pass word1 ' };
    expect(normaliseSignUp(spaced).password).toBe(' pass word1 ');
  });
});

describe('sign in validation', () => {
  it('only asks that both fields were filled in', () => {
    // 14.4: a wrong address and a wrong password give the same answer, so the
    // form must not pre-judge which one is which.
    expect(signInSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(true);
  });

  it.each([
    [{ email: '', password: 'x' }, 'validation.emailInvalid'],
    [{ email: 'a@b.com', password: '' }, 'validation.passwordRequired'],
  ])('rejects %p', (values, expected) => {
    const result = signInSchema.safeParse(values);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(expected);
    }
  });

  it('normalises the address the same way sign up does', () => {
    expect(normaliseSignIn({ email: ' Player@Example.com ', password: 'x' })).toEqual({
      email: 'player@example.com',
      password: 'x',
    });
  });
});

describe('single address forms', () => {
  it.each([forgotPasswordSchema, changeEmailSchema])('requires a real address', (schema) => {
    expect(schema.safeParse({ email: 'player@example.com' }).success).toBe(true);
    expect(schema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});
