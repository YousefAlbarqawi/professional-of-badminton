/**
 * Reloading the app so a layout direction change takes effect.
 *
 * `I18nManager.forceRTL()` writes a native flag that only the next launch
 * reads. Both places that change direction need this: the language switch the
 * player asks for (16.1, `useChangeLanguage`) and the startup alignment that
 * repairs a cold start (`alignLayoutDirection`).
 */
import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';

/** Reload the app so a direction change takes effect. */
export async function restart(): Promise<void> {
  try {
    await Updates.reloadAsync();
  } catch {
    // reloadAsync is unavailable in Expo Go and in some dev contexts. Fall
    // back to the dev reload so the switch is still testable there; in a
    // production build reloadAsync is always available.
    if (__DEV__) {
      DevSettings.reload();
      return;
    }
    throw new Error('restart_failed');
  }
}
