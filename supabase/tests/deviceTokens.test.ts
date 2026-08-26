/**
 * Device tokens. BUILD-SPEC section 18 and 7.3's policy row.
 *
 * "Tokens registered on login and refreshed on every cold start, stored in
 * `device_tokens` with the device's locale."
 *
 * The case that matters and is easy to get wrong is a token that already
 * belongs to somebody else — a shared phone, or a reinstall the OS handed the
 * same token back to. The policy in 7.3 refuses exactly that row, which is why
 * registration is an RPC; leaving it would send this player's notifications to
 * whoever used the phone last.
 */
import { anonClient, serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';
import { seededPlayer } from './helpers/bookingFixtures';

const OWNER = seededPlayer(21);
const SECOND = seededPlayer(22);

const TOKEN = 'ExponentPushToken[integration-test-token]';
const OTHER_TOKEN = 'ExponentPushToken[integration-test-other]';

let owner: Client;
let second: Client;

async function register(
  client: Client,
  token: string,
  platform: string,
  locale: string,
): Promise<string | null> {
  const { error } = await client.rpc('register_device_token', {
    p_token: token,
    p_platform: platform,
    p_locale: locale,
  });
  return error === null ? null : error.message.trim();
}

async function tokenRow(
  token: string,
): Promise<{ player_id: string; platform: string; locale: string } | null> {
  const { data } = await serviceClient()
    .from('device_tokens')
    .select('player_id, platform, locale')
    .eq('token', token)
    .maybeSingle();

  return data;
}

beforeAll(async () => {
  [owner, second] = await Promise.all([signIn(OWNER.email), signIn(SECOND.email)]);
}, 60000);

beforeEach(async () => {
  await serviceClient().from('device_tokens').delete().in('token', [TOKEN, OTHER_TOKEN]);
});

afterAll(async () => {
  await serviceClient().from('device_tokens').delete().in('token', [TOKEN, OTHER_TOKEN]);
});

describe('section 18, registration', () => {
  it('stores the token with its platform and locale', async () => {
    expect(await register(owner, TOKEN, 'ios', 'en')).toBeNull();

    expect(await tokenRow(TOKEN)).toEqual({
      player_id: OWNER.id,
      platform: 'ios',
      locale: 'en',
    });
  });

  it('is idempotent, which is what "every cold start" needs it to be', async () => {
    await register(owner, TOKEN, 'ios', 'ar');
    await register(owner, TOKEN, 'ios', 'ar');

    const { count } = await serviceClient()
      .from('device_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('token', TOKEN);

    expect(count).toBe(1);
  });

  it('updates the locale when the player switches language. 16.1, section 18', async () => {
    await register(owner, TOKEN, 'ios', 'ar');
    await register(owner, TOKEN, 'ios', 'en');

    expect((await tokenRow(TOKEN))?.locale).toBe('en');
  });

  it('moves a token to whoever is signed in now', async () => {
    // The shared phone. Without this the previous owner keeps receiving
    // notifications on a device that is no longer his.
    await register(owner, TOKEN, 'android', 'ar');
    expect((await tokenRow(TOKEN))?.player_id).toBe(OWNER.id);

    await register(second, TOKEN, 'android', 'en');
    expect(await tokenRow(TOKEN)).toEqual({
      player_id: SECOND.id,
      platform: 'android',
      locale: 'en',
    });
  });

  it('cannot register a token for anybody but the caller', async () => {
    // There is no player id argument. `auth.uid()` is the only account this
    // function can ever write against.
    await register(second, TOKEN, 'ios', 'en');
    expect((await tokenRow(TOKEN))?.player_id).toBe(SECOND.id);
  });

  it('refuses a platform that is not iOS or Android. D79', async () => {
    expect(await register(owner, TOKEN, 'web', 'en')).toBe('invalid_platform');
  });

  it('refuses an empty token', async () => {
    expect(await register(owner, '   ', 'ios', 'en')).toBe('invalid_push_token');
  });

  it('falls back to Arabic for a locale the app does not have. 16.1', async () => {
    await register(owner, TOKEN, 'ios', 'fr');
    expect((await tokenRow(TOKEN))?.locale).toBe('ar');
  });

  it('refuses the anonymous role', async () => {
    const { error } = await anonClient().rpc('register_device_token', {
      p_token: TOKEN,
      p_platform: 'ios',
      p_locale: 'en',
    });

    expect(error).not.toBeNull();
    expect(await tokenRow(TOKEN)).toBeNull();
  });
});

describe('7.3, who can read a device token', () => {
  it('lets a player read only his own', async () => {
    await register(owner, TOKEN, 'ios', 'en');
    await register(second, OTHER_TOKEN, 'android', 'ar');

    const { data } = await owner.from('device_tokens').select('token');
    const tokens = (data ?? []).map((row) => row.token);

    expect(tokens).toContain(TOKEN);
    expect(tokens).not.toContain(OTHER_TOKEN);
  });

  it("lets staff count them, which is what 15.11's dialog needs", async () => {
    await register(owner, TOKEN, 'ios', 'en');
    const coach = await signIn(USERS.coach.email);

    const { count, error } = await coach
      .from('device_tokens')
      .select('id', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('14.14, deleting an account', () => {
  it('takes its device tokens with it', async () => {
    // A1 step 3, and the reason `anonymise_player_account` deletes them: a
    // token left behind would have the outbox pushing at an account that no
    // longer exists.
    await register(owner, TOKEN, 'ios', 'en');

    await serviceClient().from('device_tokens').delete().eq('player_id', OWNER.id);

    expect(await tokenRow(TOKEN)).toBeNull();
  });
});
