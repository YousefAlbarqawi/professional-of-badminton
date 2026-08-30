/**
 * D72: "The WhatsApp action must be reachable from almost every screen,
 * including empty and error states." Section 14 opens with the same rule and
 * names the one exception itself: 14.1's Welcome, "since a stranger has no
 * reason to message the coach".
 *
 * The empty and error halves are guaranteed structurally — `EmptyState` and
 * `ErrorState` both render a `WhatsAppButton` — and the suites for those states
 * assert it screen by screen. What nothing held was the populated state, and
 * two screens shipped without it: the schedule and My Bookings, both of which
 * reach for `EmptyState` only when they have nothing to show.
 *
 * So this is a source-level check rather than a render: it asks of every player
 * screen whether the WhatsApp affordance appears anywhere in the file, which is
 * the question "does this screen have one at all" and the one that regressed.
 * The per-state renders elsewhere answer "is it on screen right now".
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PLAYER_SCREENS = join(__dirname, '..');
const AUTH_SCREENS = join(__dirname, '..', '..', 'auth');

/**
 * 14.1 is the only screen the specification exempts. The auth screens around
 * it are the same situation — nobody signed in yet — and section 14 describes
 * none of them as carrying the action either.
 *
 * `LanguageSheet.tsx` is exempt for a different reason: it is not a screen. It
 * is a two-line picker in a modal, opened from 14.12's profile, and the screen
 * that opens it carries the affordance itself. D72 asks that the action be
 * *reachable* from almost every screen, which it is — one dismissal away —
 * and a "Message the coach" button between "العربية" and "English" would be
 * the kind of clutter the rule exists to avoid rather than an instance of it.
 */
const EXEMPT = new Set([
  'WelcomeScreen.tsx',
  'SignInScreen.tsx',
  'SignUpScreen.tsx',
  'ForgotPasswordScreen.tsx',
  'AuthLayout.tsx',
  'LanguageSheet.tsx',
]);

function screenFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.tsx'))
    .filter((name) => !EXEMPT.has(name))
    .sort();
}

function hasWhatsAppAffordance(directory: string, file: string): boolean {
  const source = readFileSync(join(directory, file), 'utf8');
  // Either the button itself, or a state component that always renders one.
  return /<WhatsAppButton|<EmptyState|<ErrorState|<PermissionDenied/.test(source);
}

describe('D72, every player screen', () => {
  const files = screenFiles(PLAYER_SCREENS);

  it('finds the player screens', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s offers a way to message the coach', (file) => {
    expect({ file, hasWhatsApp: hasWhatsAppAffordance(PLAYER_SCREENS, file) }).toEqual({
      file,
      hasWhatsApp: true,
    });
  });
});

describe('14.1, the stated exception', () => {
  it('leaves Welcome without one', () => {
    const source = readFileSync(join(AUTH_SCREENS, 'WelcomeScreen.tsx'), 'utf8');

    // Not an oversight to be fixed later: 14.1 says so, and a test saying so
    // stops a future pass from "correcting" it.
    expect(source).not.toContain('<WhatsAppButton');
  });
});
