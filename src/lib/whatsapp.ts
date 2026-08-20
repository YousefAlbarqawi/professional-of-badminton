/**
 * WhatsApp. There is no in-app chat; every player to coach conversation
 * happens here. D71 and D72.
 */
import { Linking } from 'react-native';

import { config } from './config';

export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${config.whatsappNumber}`;
  if (message === undefined || message.trim() === '') return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Open a WhatsApp conversation with the coach. Uses the https wa.me link,
 * which falls back to the browser when WhatsApp is not installed, so the
 * action never dead-ends.
 */
export async function openWhatsApp(message?: string): Promise<void> {
  await Linking.openURL(whatsappUrl(message));
}
