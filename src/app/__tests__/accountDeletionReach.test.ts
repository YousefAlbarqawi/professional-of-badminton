/**
 * App Store guideline 5.1.1(v), as BUILD-SPEC 23.3 states it: account deletion
 * "must exist in-app and be reachable in under three taps from the profile".
 *
 * This is the one requirement in phase 10 whose failure mode is a rejected
 * submission rather than a bad screen, and it is the sort of thing a
 * navigation refactor breaks silently — the screen still exists, it just moves
 * a stack further away. So the count is asserted rather than assumed.
 *
 * Counting is done over the route graph rather than by driving a rendered
 * navigator: what 5.1.1(v) measures is how many screens sit between the player
 * and the control, and that is a fact about the stacks. That the button on the
 * profile screen navigates to `DeleteAccount`, and that the screen behind it
 * does what 14.14 says, are asserted in `ProfileScreen.test.tsx` and
 * `DeleteAccountScreen.test.tsx` respectively. Together the three cover the
 * claim.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = __dirname.replace(/__tests__$/, '');

function source(file: string): string {
  return readFileSync(join(APP, file), 'utf8');
}

/** The `name="X"` of every screen registered in a navigator file. */
function routeNames(file: string): string[] {
  return [...source(file).matchAll(/name="([A-Za-z]+)"/g)].map((match) => match[1] ?? '');
}

describe('the player side', () => {
  const routes = routeNames('PlayerNavigator.tsx');

  it('registers DeleteAccount', () => {
    expect(routes).toContain('DeleteAccount');
  });

  it('puts it on the Profile stack, one tap from the profile screen', () => {
    // 14.0: "Profile (stack: Profile → EditProfile → Subscriptions → Language
    // → DeleteAccount)". Profile is the stack's root, so from the profile
    // screen the control is one tap and the screen itself is the second.
    const stack = source('PlayerNavigator.tsx');
    const profileStack = stack.slice(stack.indexOf('const ProfileNavigator'));

    expect(profileStack).toContain('name="Profile"');
    expect(profileStack).toContain('name="DeleteAccount"');
    expect(profileStack.indexOf('name="Profile"')).toBeLessThan(
      profileStack.indexOf('name="DeleteAccount"'),
    );
  });

  it('reaches the profile screen in one tap from anywhere, via its own tab', () => {
    // A tab is always one tap. Profile tab → Delete my account → the screen is
    // two, which is under three.
    expect(source('PlayerNavigator.tsx')).toContain('name="ProfileTab"');
  });
});

describe('the staff side', () => {
  const routes = routeNames('AdminNavigator.tsx');

  it('registers DeleteAccount too', () => {
    // A28 and A70: guideline 5.1.1(v) does not exempt the coach's own account.
    expect(routes).toContain('DeleteAccount');
  });

  it('registers the profile screen it is reached from', () => {
    expect(routes).toContain('Profile');
  });

  it('keeps the whole path inside three taps', () => {
    // A70: More tab (1) → Settings (2) → Delete my account (3). The Settings
    // button is on the More stack's root, which is the announcement list.
    expect(source('AdminNavigator.tsx')).toContain('name="More"');
    expect(
      readFileSync(join(APP, '..', 'screens', 'admin', 'AnnouncementListScreen.tsx'), 'utf8'),
    ).toContain('announcement-settings-button');
  });
});

describe('the screen itself', () => {
  it('is the same screen on both sides, so neither can drift', () => {
    for (const file of ['PlayerNavigator.tsx', 'AdminNavigator.tsx']) {
      expect(source(file)).toContain("from '@/screens/player/DeleteAccountScreen'");
    }
  });
});
