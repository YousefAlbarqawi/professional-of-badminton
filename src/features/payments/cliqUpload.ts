/**
 * The CliQ screenshot: picked, shrunk, and uploaded. BUILD-SPEC 10.1.
 *
 * Steps 3, 4 and 5 of 10.1, in order:
 *
 *   3. "Player taps Attach screenshot, picks from gallery or camera"
 *   4. "The image is resized to a maximum 1600px on the long edge and
 *       compressed to JPEG quality 0.7 before upload"
 *   5. "Upload to payment-proofs/{user_id}/{booking_id}.jpg"
 *
 * Step 4 is not cosmetic. A modern phone screenshot is 3 to 6 MB, the bucket
 * caps an object at 10 MB (6.2), and the coach reviews these over gym wifi. A
 * 1600px JPEG at 0.7 is around 200 KB and still legible enough to read a
 * transfer reference off, which is the only thing anybody does with it — D36
 * forbids reading them automatically.
 *
 * Nothing here decides whether the booking may be made. `prepare_cliq_booking`
 * has already said yes and named the file, and `create_cliq_booking` will
 * decide again once the object is up. See migration 0025.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

import type { PreparedProof } from './types';

/** 10.1 step 4. */
export const MAX_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.7;

const BUCKET = 'payment-proofs';

/**
 * What to resize to, given what was picked.
 *
 * Only the long edge is constrained, and only downwards: enlarging a small
 * screenshot would cost bytes and add nothing. Returning null means "leave it
 * alone", which is the common case for a screenshot already under 1600px on a
 * smaller phone.
 */
export function resizeTarget(
  width: number,
  height: number,
): { width: number } | { height: number } | null {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_LONG_EDGE) return null;

  // expo-image-manipulator keeps the aspect ratio when given one dimension, so
  // constraining the long edge is enough and rounding cannot drift the other.
  return width >= height ? { width: MAX_LONG_EDGE } : { height: MAX_LONG_EDGE };
}

/** 10.1 step 5. The one path `create_cliq_booking` will accept. */
export function proofStoragePath(userId: string, bookingId: string): string {
  return `${userId}/${bookingId}.jpg`;
}

export type ProofSource = 'library' | 'camera';

/**
 * 10.1 step 3, then step 4. Returns null when the player backs out of the
 * picker, which is not an error and must not look like one.
 *
 * Permission is requested here rather than up front, matching the way section
 * 18 asks for notification permission: at the moment it is needed, with the
 * reason already on screen.
 */
export async function pickAndPrepareProof(source: ProofSource): Promise<PreparedProof | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(source === 'camera' ? 'camera_permission_denied' : 'library_permission_denied');
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1, allowsMultipleSelection: false })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 1,
          allowsMultipleSelection: false,
        });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (asset === undefined) return null;

  return prepareProof(asset.uri, asset.width, asset.height);
}

/** 10.1 step 4, separated so it can be exercised without a picker. */
export async function prepareProof(
  uri: string,
  width: number,
  height: number,
): Promise<PreparedProof> {
  const target = resizeTarget(width, height);

  const context = ImageManipulator.ImageManipulator.manipulate(uri);
  if (target !== null) context.resize(target);

  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  // The bucket's file_size_limit and payment_proofs.file_size_bytes are both
  // in bytes, and the proof row will not accept a guess.
  const response = await fetch(image.uri);
  const blob = await response.blob();

  return {
    uri: image.uri,
    width: image.width,
    height: image.height,
    bytes: blob.size,
    mimeType: 'image/jpeg',
  };
}

/**
 * 10.1 step 5. Throws on failure, which is the whole point: step 6 says
 * `create_cliq_booking` "is called only after the upload succeeds", so a
 * rejected promise here is what stops the booking existing.
 *
 * `upsert` is false deliberately. The bucket has no UPDATE policy (7.3, and
 * migration 0013), so a second attempt at the same path would fail anyway —
 * and each attempt has its own booking id, so there is never a legitimate
 * reason to overwrite.
 */
export async function uploadProof(storagePath: string, proof: PreparedProof): Promise<void> {
  const response = await fetch(proof.uri);
  const body = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, { contentType: proof.mimeType, upsert: false });

  if (error) throw error;
}
