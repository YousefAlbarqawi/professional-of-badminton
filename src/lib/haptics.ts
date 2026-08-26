/**
 * Haptic feedback. BUILD-SPEC 17.4 and section 2.1.
 *
 * Exactly the two triggers 17.4 names, nothing else: booking success and a
 * court board swap. `expo-haptics` calls are fire-and-forget by design — a
 * failed vibration (no haptics hardware, permission quirks on some Android
 * OEMs) must never surface as an app error.
 */
import * as Haptics from 'expo-haptics';

export function hapticBookingSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticSwap(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
