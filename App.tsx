/**
 * App root.
 *
 * Nothing renders until two things are ready: the resolved locale, and the
 * Cairo font. Section 17.1 requires Cairo to be loaded before the first render
 * so Arabic never flashes in a fallback face, and section 16.1 requires the
 * language to be settled before the tree mounts so the layout direction is
 * right the first time.
 *
 * The splash screen stays up for both.
 */
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaView, StyleSheet, View } from 'react-native';

import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import i18n, { initI18n } from '@/i18n';
import { CAIRO_FONTS, ThemeProvider, colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function App(): React.ReactElement | null {
  const [isI18nReady, setIsI18nReady] = useState(false);
  const [areFontsLoaded, fontError] = useFonts(CAIRO_FONTS);

  useEffect(() => {
    void initI18n().then(() => setIsI18nReady(true));
  }, []);

  // A missing font must not keep the app on the splash screen forever; the
  // system face is an acceptable degradation, a permanent splash is not.
  const isReady = isI18nReady && (areFontsLoaded || fontError !== null);

  const handleLayout = useCallback((): void => {
    if (isReady) void SplashScreen.hideAsync();
  }, [isReady]);

  if (!isReady) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <View style={styles.root} onLayout={handleLayout}>
          <StatusBar style="light" />
          <SafeAreaView style={styles.root}>
            <PlaceholderScreen />
          </SafeAreaView>
        </View>
      </ThemeProvider>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
