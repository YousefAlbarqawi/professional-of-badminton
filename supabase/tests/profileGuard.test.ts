import { serviceClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';

/**
 * "A player cannot change his own role, visibility, tier, or custom rates."
 *
 * The policy lets him update his own row; the trigger decides which columns.
 * Section 7.3, guard_profile_privileged_fields.
 *
 * These tests run against USERS.guardSubject, an account no other suite
 * asserts on, because they promote and demote him along the way.
 */
describe('guard_profile_privileged_fields', () => {
  let subject: Client;
  let admin: Client;
  let coach: Client;

  beforeAll(async () => {
    [subject, admin, coach] = await Promise.all([
      signIn(USERS.guardSubject.email),
      signIn(USERS.admin.email),
      signIn(USERS.coach.email),
    ]);
  });

  afterAll(async () => {
    // The reset goes through the coach, not the service role. The trigger
    // fires for service_role too, and auth.uid() is null there, so is_staff()
    // is false and a role change would be refused.
    const { error } = await coach
      .from('profiles')
      .update({ role: 'player', visibility: 'level_0', tier: null })
      .eq('id', USERS.guardSubject.id);

    if (error) throw new Error(`Could not restore the guard subject: ${error.message}`);
  });

  describe('a player updating his own profile', () => {
    it.each([
      ['role', { role: 'admin' as const }],
      ['visibility', { visibility: 'level_2' as const }],
      ['tier', { tier: 'C-' as const }],
      ['custom_rate_standard_fils', { custom_rate_standard_fils: 0 }],
      ['custom_rate_extended_fils', { custom_rate_extended_fils: 0 }],
    ])('cannot change %s', async (_label, patch) => {
      const { error } = await subject
        .from('profiles')
        .update(patch)
        .eq('id', USERS.guardSubject.id);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('not_authorized_to_change_privileged_fields');
    });

    it('cannot smuggle a privileged change in alongside a permitted one', async () => {
      const { error } = await subject
        .from('profiles')
        .update({ first_name: 'Renamed', visibility: 'level_2' })
        .eq('id', USERS.guardSubject.id);

      expect(error).not.toBeNull();

      const service = serviceClient();
      const { data } = await service
        .from('profiles')
        .select('first_name, visibility')
        .eq('id', USERS.guardSubject.id)
        .single();

      expect(data?.first_name).toBe('Player');
      expect(data?.visibility).toBe('level_0');
    });

    it('can still change what is his to change', async () => {
      const { data, error } = await subject
        .from('profiles')
        .update({ preferred_locale: 'en', phone: '+962790000999' })
        .eq('id', USERS.guardSubject.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.preferred_locale).toBe('en');

      await subject
        .from('profiles')
        .update({ preferred_locale: 'ar', phone: '+96279' + '0000040' })
        .eq('id', USERS.guardSubject.id);
    });
  });

  describe('a player updating someone else', () => {
    it('changes nothing, because the row is not his to see', async () => {
      const { data, error } = await subject
        .from('profiles')
        .update({ preferred_locale: 'en' })
        .eq('id', USERS.level2.id)
        .select();

      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });

  describe('staff', () => {
    it('the admin can set a tier and a visibility level', async () => {
      const { data, error } = await admin
        .from('profiles')
        .update({ tier: 'B+', visibility: 'level_1' })
        .eq('id', USERS.guardSubject.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data?.tier).toBe('B+');
      expect(data?.visibility).toBe('level_1');
    });

    it('the admin cannot create a coach', async () => {
      const { error } = await admin
        .from('profiles')
        .update({ role: 'coach' })
        .eq('id', USERS.guardSubject.id);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('only_coach_can_create_coach');
    });

    it('the coach can', async () => {
      const { error } = await coach
        .from('profiles')
        .update({ role: 'coach' })
        .eq('id', USERS.guardSubject.id)
        .select()
        .single();

      expect(error).toBeNull();
    });
  });
});
