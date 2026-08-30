/**
 * App root.
 *
 * Nothing renders until two things are ready: the resolved locale, and the
 * Cairo font. Section 17.1 requires Cairo to be loaded before the first render
 * so Arabic never flashes in a fallback face, and section 16.1 requires the
 * language to be settled before the tree mounts so the layout direction is
 * right the first time.
 *
 * The splash screen stays up for both. Restoring the session happens under
 * RootNavigator rather than here, because it needs the theme and the strings to
 * show anything while it waits.
 *
 * `AnimatedSplashHost` covers the seam where the native splash is torn down:
 * it draws the same logo on the same background and fades out. See
 * `app/AnimatedSplash.tsx`.
 */
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplashHost } from '@/app/AnimatedSplash';
import { RootNavigator } from '@/app/RootNavigator';
import { navigationRef } from '@/app/navigationRef';
import { navigationTheme } from '@/app/navigationTheme';
import { AppErrorBoundary } from '@/components/states';
import { foregroundBehaviour } from '@/features/notifications/routing';
import { AuthProvider } from '@/features/auth/AuthProvider';
import i18n, { initI18n } from '@/i18n';
import { initMonitoring } from '@/lib/monitoring';
import { queryClient, startFocusTracking } from '@/lib/queryClient';
import { CAIRO_FONTS, ThemeProvider, colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// BUILD-SPEC 23.4. At module scope, so the crash handlers are installed before
// the first component mounts and a throw during startup is still reported —
// otherwise the one crash nobody hears about is the one that stops the app
// opening at all. This is also what installs the unhandled promise rejection
// handler 23.4 names. It does nothing without a DSN.
initMonitoring();

// What happens to one of section 18's two notifications when it arrives while
// the player is looking at the app. Set at module scope because the library
// wants the handler in place before the first notification can reach it, which
// on a cold launch is before any component has mounted.
Notifications.setNotificationHandler({
  handleNotification: async () => foregroundBehaviour,
});

export default function App(): React.ReactElement | null {
  const [isI18nReady, setIsI18nReady] = useState(false);
  const [areFontsLoaded, fontError] = useFonts(CAIRO_FONTS);

  useEffect(() => {
    // `isReloading` means the resolved language disagreed with the native
    // layout direction and the app is relaunching to pick it up. Staying on
    // the splash screen is the point: the launch being replaced must never
    // render, or the player sees the mirroring it exists to correct.
    void initI18n().then(({ isReloading }) => {
      if (!isReloading) setIsI18nReady(true);
    });
  }, []);

  // Query polling and refetching follow the foreground, not a browser window
  // that does not exist here.
  useEffect(startFocusTracking, []);

  // A missing font must not keep the app on the splash screen forever; the
  // system face is an acceptable degradation, a permanent splash is not.
  const isReady = isI18nReady && (areFontsLoaded || fontError !== null);

  const handleLayout = useCallback((): void => {
    if (isReady) void SplashScreen.hideAsync();
  }, [isReady]);

  if (!isReady) return null;

  return (
    // Gesture handler needs a root view above everything that uses it. Only
    // the court board does (2.1), but the root is where the library requires
    // it and a second one lower down would not work.
    <GestureHandlerRootView style={styles.root}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <ThemeProvider>
              {/* Inside ThemeProvider and I18nextProvider, because its fallback
                  is a themed, translated ErrorState with a WhatsApp button
                  (D72), and outside everything that can throw while rendering. */}
              <AppErrorBoundary>
                <AuthProvider>
                  <View
                    style={styles.root}
                    onLayout={handleLayout}
                    // TEMPORARY DIAGNOSTIC — remove. Logs every touch React
                    // Native actually receives, without consuming it, so a tap
                    // that "does nothing" can be told apart from one that never
                    // arrived.
                    onStartShouldSetResponderCapture={(event) => {
                      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
                      console.log(
                        `[POB-TOUCH] page=${Math.round(pageX)},${Math.round(pageY)} location=${Math.round(locationX)},${Math.round(locationY)}`,
                      );
                      return false;
                    }}
                  >
                    <StatusBar style="light" />
                    {/* The ref is how a notification tap navigates. Section 18. */}
                    <NavigationContainer theme={navigationTheme} ref={navigationRef}>
                      <RootNavigator />
                    </NavigationContainer>
                    {/* Over the tree, not instead of it: the native splash has
                        just been hidden and this picks the same logo up on the
                        same background, animates it once, and retires itself.
                        Nothing below waits for it. */}
                    <AnimatedSplashHost />
                  </View>
                </AuthProvider>
              </AppErrorBoundary>
            </ThemeProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
