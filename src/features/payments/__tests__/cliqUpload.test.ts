/**
 * The screenshot pipeline. BUILD-SPEC 10.1 steps 4 and 5.
 *
 * The resize target and the storage path are the two parts of 10.1 that are
 * arithmetic rather than plumbing, and both have a way of going wrong quietly:
 * an enlarged screenshot costs bytes for nothing, and a path off by one
 * character is refused by `create_cliq_booking` after the upload has already
 * happened.
 */
import { JPEG_QUALITY, MAX_LONG_EDGE, proofStoragePath, resizeTarget } from '../cliqUpload';

describe('10.1 step 4, the resize target', () => {
  it('constrains the long edge to 1600px on a tall screenshot', () => {
    // A modern phone screenshot. Height is the long edge, so height is what is
    // constrained; the manipulator keeps the ratio from there.
    expect(resizeTarget(1170, 2532)).toEqual({ height: MAX_LONG_EDGE });
  });

  it('constrains the width when the image is landscape', () => {
    expect(resizeTarget(3024, 1700)).toEqual({ width: MAX_LONG_EDGE });
  });

  it('leaves an image already inside the limit alone', () => {
    // Only downwards. Enlarging a small screenshot would cost bytes and add
    // nothing a coach could read.
    expect(resizeTarget(750, 1334)).toBeNull();
    expect(resizeTarget(1600, 900)).toBeNull();
  });

  it('treats a square image at the limit as needing nothing', () => {
    expect(resizeTarget(MAX_LONG_EDGE, MAX_LONG_EDGE)).toBeNull();
    expect(resizeTarget(MAX_LONG_EDGE + 1, MAX_LONG_EDGE + 1)).toEqual({ width: MAX_LONG_EDGE });
  });

  it('compresses at the quality 10.1 names', () => {
    expect(JPEG_QUALITY).toBe(0.7);
    expect(MAX_LONG_EDGE).toBe(1600);
  });
});

describe('10.1 step 5, the storage path', () => {
  it('is exactly {user_id}/{booking_id}.jpg', () => {
    // The storage policy checks the first folder against auth.uid() (migration
    // 0013) and create_cliq_booking checks the whole string (migration 0025).
    // Both ends have to agree on this one shape and no other.
    expect(
      proofStoragePath(
        '33333333-3333-4333-8333-000000000004',
        '55555555-5555-4555-8555-000000000004',
      ),
    ).toBe('33333333-3333-4333-8333-000000000004/55555555-5555-4555-8555-000000000004.jpg');
  });
});
