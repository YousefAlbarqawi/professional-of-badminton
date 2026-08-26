/**
 * BUILD-SPEC section 18: "Tokens registered on login and refreshed on every
 * cold start", and "permission is requested contextually, the first time the
 * player joins a waiting list, not on first launch".
 *
 * The second sentence is the one worth a test, because getting it wrong is
 * invisible in code review and obvious to a player: a system dialog on first
 * launch. So most of what is asserted here is what this module refuses to do.
 */
import * as Notifications from 'expo-notifications';

// Mutable, so the "no EAS project" case can be exercised without reloading the
// module graph. `acquireDeviceToken` reads the field at call time.
const testConfig = { easProjectId: 'test-project' };

jest.mock('@/lib/config', () => ({
  config: testConfig,
  get hasPushProject(): boolean {
    return testConfig.easProjectId !== '';
  },
}));

// eslint-disable-next-line import/first -- the config mock has to be registered before the module under test is loaded, and the mutable object it closes over has to be declared before the mock.
import { acquireDeviceToken } from '../deviceToken';

const permissions = Notifications.getPermissionsAsync as jest.Mock;
const token = Notifications.getExpoPushTokenAsync as jest.Mock;
const requestPermission = Notifications.requestPermissionsAsync as jest.Mock;

describe('acquireDeviceToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testConfig.easProjectId = 'test-project';
    permissions.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
    token.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
  });

  it('returns the token, the platform and the locale when permission is granted', async () => {
    const registration = await acquireDeviceToken();

    expect(registration?.token).toBe('ExponentPushToken[abc]');
    expect(registration?.platform).toBe('ios');
    // Section 18 puts the payload's language on the device row, so a
    // registration always carries one of the two supported locales.
    expect(['ar', 'en']).toContain(registration?.locale);
  });

  it('never asks for permission', async () => {
    // Section 18 puts the request at the waiting list join and nowhere else.
    // A cold start is first launch for anybody who has not joined one yet.
    await acquireDeviceToken();

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('registers nothing when permission has not been granted', async () => {
    permissions.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });

    expect(await acquireDeviceToken()).toBeNull();
    expect(token).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when the device refuses', async () => {
    // A simulator with no push support, a revoked APNs key, no network. None
    // is worth interrupting a player who did not ask for any of this.
    token.mockRejectedValue(new Error('no push support'));

    expect(await acquireDeviceToken()).toBeNull();
  });

  it('returns null when the token comes back empty', async () => {
    token.mockResolvedValue({ data: '' });

    expect(await acquireDeviceToken()).toBeNull();
  });

  it('skips registration entirely without an EAS project id', async () => {
    // A build with no project cannot receive a notification, so there is
    // nothing to store. It is a deployment gap, not an error the player sees.
    testConfig.easProjectId = '';

    expect(await acquireDeviceToken()).toBeNull();
    expect(permissions).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
  });
});
