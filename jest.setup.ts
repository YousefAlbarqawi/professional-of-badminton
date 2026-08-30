import type * as ReactModule from 'react';

// A Supabase client is constructed at module scope in src/lib/supabase.ts and
// refuses to be built without a URL and a key. These are the local stack's
// defaults; no test reaches the network, but the module has to load.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';

// Fonts are native modules; unit tests only need the pure logic underneath.
jest.mock('expo-font');

// AsyncStorage is a native module. Its official Jest mock keeps the locale
// persistence path exercisable without a device.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-localization reaches into a native module for the device locale.
// The default here is deliberately an English device, so that tests exercise
// the "device locale is only a tiebreak when it is English" rule (16.1).
jest.mock('expo-localization', () => ({
  getLocales: (): { languageCode: string | null }[] => [{ languageCode: 'en' }],
}));

// The keychain, in memory. Chunking is tested against its own fake backend in
// src/lib/__tests__/secureStorage.test.ts; this is only so the module loads.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
    WHEN_UNLOCKED: 'whenUnlocked',
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// Section 18's surface, in memory. 14.12 reads the permission status, the
// waiting list asks for it (18), and phase 8 registers a token, sets a channel
// and listens for taps. The defaults here are a phone that has already said
// yes, because that is the state most tests want to be in; a suite that cares
// about a refusal overrides `getPermissionsAsync` itself.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  getPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Sentry's native module. BUILD-SPEC 23.4 wires it for crashes; no test sends
// anything anywhere, and `src/lib/__tests__/monitoring.test.ts` asserts on the
// options this mock records rather than on Sentry's behaviour.
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: <T>(component: T): T => component,
}));

// The language switch reloads the app to apply a direction change.
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(async () => undefined),
}));

// A35's picker (DateField) is a native module. The mock is a bare host View
// forwarding every prop it was given (`testID`, `onChange`, `minimumDate`, …),
// so RNTL's `fireEvent(getByTestId(...), 'change', event, date)` reaches the
// real component's own handler exactly as the native module would call it,
// and a test can assert on anything DateField passed through — nothing about
// the wheel itself is faked, only its native rendering.
jest.mock('@react-native-community/datetimepicker', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React: typeof ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');

  const DateTimePicker = (
    props: Record<string, unknown>,
  ): ReactModule.ReactElement => React.createElement(View, props);

  return { __esModule: true, default: DateTimePicker };
});

// react-native-safe-area-context ships a Jest mock as .tsx, which this preset
// does not transform, and it omits the contexts React Navigation's headers read.
// A minimal stand-in with real contexts is simpler than either.
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React: typeof ReactModule = require('react');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  const SafeAreaInsetsContext = React.createContext(insets);
  const SafeAreaFrameContext = React.createContext(frame);

  return {
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaContext: SafeAreaInsetsContext,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
    withSafeAreaInsets:
      (Component: React.ComponentType<Record<string, unknown>>) =>
      (props: Record<string, unknown>) =>
        React.createElement(Component, { ...props, insets }),
  };
});

// The court board is the only screen with gestures (BUILD-SPEC 2.1).
// Gesture handler ships its own Jest setup, which registers the mock
// components `GestureDetector` renders.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-gesture-handler/jestSetup');

// `GestureDetector` wires a gesture to the UI thread through Reanimated's
// event machinery, which the mock below deliberately does not reproduce. It
// renders its child either way, so under Jest it is its child. The drag itself
// is not testable through the renderer; its hit test is a pure function and is
// tested directly in src/features/matchmaking/__tests__/boardLayout.test.ts.
jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual<Record<string, unknown>>('react-native-gesture-handler');
  return {
    ...actual,
    GestureDetector: ({ children }: { children: ReactModule.ReactNode }) => children,
  };
});

// Reanimated's own `mock` entry point reaches through react-native-worklets
// into a native module that does not exist under Jest, and every suite that
// so much as imports a screen dies on it. So the pieces the app actually uses
// are replaced here: a shared value is a plain box, an animated style is its
// worklet run once on the JS thread, every `with*` resolves to its target
// value immediately, and `Animated.View` is a `View`.
//
// This started as the four things the court board needs. The welcome
// backdrop's drifting shuttlecocks and the animated splash need five more —
// `withDelay`, `withRepeat`, `interpolate`, `Easing` and `useReducedMotion` —
// and a missing one is not a soft failure: the import resolves to `undefined`
// and the component throws on render, taking its whole suite with it.
//
// `interpolate` is implemented rather than stubbed, because an animated style
// that returns `undefined` for a transform is a style React Native rejects.
// `useReducedMotion` answers false, so tests exercise the animated path — the
// still path is the accommodation, not the common case.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React: typeof ReactModule = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');

  const passThrough = <T>(value: T): T => value;
  const AnimatedView = React.forwardRef<unknown, Record<string, unknown>>((props, ref) =>
    React.createElement(View, { ...props, ref }),
  );
  AnimatedView.displayName = 'Animated.View';

  return {
    __esModule: true,
    default: { View: AnimatedView, createAnimatedComponent: passThrough },
    View: AnimatedView,
    createAnimatedComponent: passThrough,
    useSharedValue: <T>(initial: T) => ({ value: initial }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useReducedMotion: () => false,
    withSpring: passThrough,
    withTiming: passThrough,
    withDelay: <T>(_delayMs: number, animation: T): T => animation,
    withRepeat: <T>(animation: T): T => animation,
    withSequence: <T>(...animations: T[]): T | undefined => animations[animations.length - 1],
    // Piecewise linear over the two arrays, extending past either end the way
    // Reanimated's default extrapolation does. Enough for a style assertion;
    // nothing here is trying to reproduce a curve.
    interpolate: (value: number, input: number[], output: number[]): number => {
      if (input.length < 2 || input.length !== output.length) return value;

      let index = input.findIndex((point, i) => i > 0 && value < point) - 1;
      if (index < 0) index = value < (input[0] ?? 0) ? 0 : input.length - 2;

      const fromX = input[index] ?? 0;
      const toX = input[index + 1] ?? 0;
      const fromY = output[index] ?? 0;
      const toY = output[index + 1] ?? 0;
      if (toX === fromX) return fromY;

      return fromY + ((value - fromX) / (toX - fromX)) * (toY - fromY);
    },
    // Every easing is identity here: `withTiming` ignores its config anyway,
    // so these exist to be callable, not to shape anything.
    Easing: {
      linear: passThrough,
      ease: passThrough,
      sin: passThrough,
      quad: passThrough,
      cubic: passThrough,
      in: passThrough,
      out: passThrough,
      inOut: passThrough,
      bezier: () => passThrough,
    },
    runOnJS: passThrough,
    runOnUI: passThrough,
  };
});
