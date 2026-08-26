/**
 * Registration, end to end against the local stack. BUILD-SPEC 14.2, D11 to
 * D14, and the phase 2 acceptance criterion that a new user can register,
 * confirm, sign in and be recognised as a player.
 *
 * Every account made here is removed afterwards, so the suite can run against
 * a seeded database repeatedly.
 */
import { anonClient, serviceClient } from './helpers/clients';

const PASSWORD = 'badminton1';

function uniqueEmail(label: string): string {
  return `phase2.${label}.${Date.now()}.${Math.floor(Math.random() * 10000)}@pob.test`;
}

const created: string[] = [];

async function register(
  email: string,
  metadata: Record<string, string> = {},
): Promise<{ userId: string | null; error: string | null }> {
  const { data, error } = await anonClient().auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: {
        first_name: 'New',
        last_name: 'Player',
        phone: '0791234567',
        preferred_locale: 'ar',
        ...metadata,
      },
    },
  });

  if (data.user?.id) created.push(data.user.id);
  return { userId: data.user?.id ?? null, error: error?.message ?? null };
}

afterAll(async () => {
  const admin = serviceClient();
  for (const id of created) {
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
});

describe('the profile trigger', () => {
  it('creates a profiles row for every new account', async () => {
    const email = uniqueEmail('creates');
    const { userId, error } = await register(email);

    expect(error).toBeNull();
    expect(userId).not.toBeNull();

    const { data } = await serviceClient()
      .from('profiles')
      .select('first_name, last_name, phone, role, visibility, preferred_locale, is_active')
      .eq('id', userId as string)
      .single();

    expect(data).toMatchObject({
      first_name: 'New',
      last_name: 'Player',
      phone: '0791234567',
      // D14: visibility starts at level 0. D13: no approval, straight to player.
      role: 'player',
      visibility: 'level_0',
      preferred_locale: 'ar',
      is_active: true,
    });
  });

  it('carries the language the app was in at sign up', async () => {
    const { userId } = await register(uniqueEmail('locale'), { preferred_locale: 'en' });

    const { data } = await serviceClient()
      .from('profiles')
      .select('preferred_locale')
      .eq('id', userId as string)
      .single();

    expect(data?.preferred_locale).toBe('en');
  });

  it('falls back to Arabic for a locale it does not recognise', async () => {
    // 16.1: Arabic is the default. A metadata value from an older build must
    // not violate the CHECK and take the whole registration down with it.
    const { userId, error } = await register(uniqueEmail('badlocale'), {
      preferred_locale: 'fr',
    });

    expect(error).toBeNull();

    const { data } = await serviceClient()
      .from('profiles')
      .select('preferred_locale')
      .eq('id', userId as string)
      .single();

    expect(data?.preferred_locale).toBe('ar');
  });

  it('leaves seeded accounts alone, which write their own profiles row', async () => {
    // supabase/seed.sql inserts auth.users directly and then its own profiles
    // rows, with roles and tiers the trigger knows nothing about. It signals
    // that by leaving the phone out of the metadata.
    const admin = serviceClient();
    const { data: user, error } = await admin.auth.admin.createUser({
      email: uniqueEmail('seedstyle'),
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'Seeded', last_name: 'Account' },
    });

    expect(error).toBeNull();
    if (user.user) created.push(user.user.id);

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.user?.id ?? '')
      .maybeSingle();

    expect(profile).toBeNull();
  });
});

describe('email confirmation', () => {
  it('withholds a session until the link is followed', async () => {
    // D12 and 2.1. GoTrue gates sign-in on confirmation, so this is also what
    // the verify screen polls against. See CONFLICTS FOUND C4 in BUILD-SPEC.md.
    const email = uniqueEmail('unconfirmed');
    await register(email);

    const { data, error } = await anonClient().auth.signInWithPassword({
      email,
      password: PASSWORD,
    });

    expect(data.session).toBeNull();
    expect(error?.code).toBe('email_not_confirmed');
  });

  it('lets a confirmed account sign in and read its own profile', async () => {
    const email = uniqueEmail('confirmed');
    const { userId } = await register(email);

    await serviceClient().auth.admin.updateUserById(userId as string, { email_confirm: true });

    const client = anonClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();

    // RLS: he reads his own row, which is what RootNavigator needs the role from.
    const { data: profile } = await client
      .from('profiles')
      .select('id, role')
      .eq('id', userId as string)
      .single();

    expect(profile).toEqual({ id: userId, role: 'player' });
  });
});

describe('duplicate registration', () => {
  it('is refused, so 14.2 can offer a way to sign in instead', async () => {
    const email = uniqueEmail('duplicate');
    await register(email);

    const { error } = await register(email);

    expect(error).not.toBeNull();
  });
});
