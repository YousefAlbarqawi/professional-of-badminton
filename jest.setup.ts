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
