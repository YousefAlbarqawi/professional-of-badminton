import { anonClient, signIn, type Client } from './helpers/clients';
import { USERS } from './helpers/fixtures';

/**
 * The payment-proofs bucket, section 7.3's closing paragraph.
 *
 * Private bucket. A player may put an object under his own user id and nowhere
 * else. Only staff may read one. Nobody may update or delete: the purge job
 * runs with the service role, which bypasses RLS and needs no policy.
 */
const BUCKET = 'payment-proofs';

function jpeg(): Blob {
  // Enough of a JPEG header to be a plausible file. Content is irrelevant to
  // the policy; the path is what is being tested.
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], {
    type: 'image/jpeg',
  });
}

describe('the payment-proofs bucket', () => {
  let player: Client;
  let other: Client;
  let coach: Client;
  let uploadedPath: string;

  beforeAll(async () => {
    [player, other, coach] = await Promise.all([
      signIn(USERS.cliqPlayer.email),
      signIn(USERS.level0.email),
      signIn(USERS.coach.email),
    ]);
    uploadedPath = `${USERS.cliqPlayer.id}/${Date.now()}.jpg`;
  });

  it('is not public', async () => {
    const { data } = await anonClient().storage.from(BUCKET).download('anything.jpg');
    expect(data).toBeNull();
  });

  it('accepts an upload under the player’s own user id', async () => {
    const { error } = await player.storage
      .from(BUCKET)
      .upload(uploadedPath, jpeg(), { contentType: 'image/jpeg' });

    expect(error).toBeNull();
  });

  it('refuses an upload under somebody else’s user id', async () => {
    const { error } = await player.storage
      .from(BUCKET)
      .upload(`${USERS.level0.id}/smuggled.jpg`, jpeg(), { contentType: 'image/jpeg' });

    expect(error).not.toBeNull();
  });

  it('accepts the exact path 10.1 specifies, {user_id}/{booking_id}.jpg', async () => {
    // The shape create_cliq_booking requires (migration 0025). Anything else
    // is refused there, so the two ends agree on one path and no other.
    // A fresh id each run: nothing may delete from this bucket, so a fixed
    // one would collide with the object the previous run left behind.
    const bookingId = `11111111-2222-4333-8444-${String(Date.now()).slice(-12)}`;
    const { error } = await player.storage
      .from(BUCKET)
      .upload(`${USERS.cliqPlayer.id}/${bookingId}.jpg`, jpeg(), { contentType: 'image/jpeg' });

    expect(error).toBeNull();
  });

  it('refuses an upload at the root of the bucket', async () => {
    const { error } = await player.storage
      .from(BUCKET)
      .upload(`loose-${Date.now()}.jpg`, jpeg(), { contentType: 'image/jpeg' });

    expect(error).not.toBeNull();
  });

  it('does not let the uploader read his own file back', async () => {
    // Deliberate: only staff may SELECT. The player already has the image on
    // his phone; the copy in storage exists for the coach's review screen.
    const { data, error } = await player.storage.from(BUCKET).download(uploadedPath);

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('does not let another player read it', async () => {
    const { data } = await other.storage.from(BUCKET).download(uploadedPath);
    expect(data).toBeNull();
  });

  it('lets the coach read it', async () => {
    const { data, error } = await coach.storage.from(BUCKET).download(uploadedPath);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('lets nobody delete, not even the owner or the coach', async () => {
    await player.storage.from(BUCKET).remove([uploadedPath]);
    await coach.storage.from(BUCKET).remove([uploadedPath]);

    const { data } = await coach.storage.from(BUCKET).download(uploadedPath);
    expect(data).not.toBeNull();
  });
});
