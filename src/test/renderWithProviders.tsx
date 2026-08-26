/**
 * The provider stack a screen needs to render in a test, minus the network.
 *
 * Not a test file itself — it lives outside `__tests__` so Jest does not pick
 * it up as one.
 */
import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { ThemeProvider } from '@/theme';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resources } from '@/i18n';
import type { Locale } from '@/lib/money';

let instance: I18nInstance | null = null;

/**
 * i18next, initialised once per worker and synchronously, so a test can assert
 * on the copy a player would actually read.
 */
export async function testI18n(locale: Locale = 'en'): Promise<I18nInstance> {
  if (instance === null) {
    // eslint-disable-next-line import/no-named-as-default-member -- the instance method, not the export.
    await i18next.use(initReactI18next).init({
      resources,
      lng: locale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      defaultNS: 'translation',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    instance = i18next;
  } else if (instance.language !== locale) {
    await instance.changeLanguage(locale);
  }
  return instance;
}

/** A client that fails fast and remembers nothing between tests. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: Locale;
  queryClient?: QueryClient;
  /** Screens that call `useNavigation` need a container around them. */
  withNavigation?: boolean;
}

/**
 * `render` resolves rather than returns under React 19's concurrent renderer,
 * so this is async and every caller awaits it.
 */
export async function renderWithProviders(
  ui: React.ReactElement,
  { locale = 'en', queryClient, withNavigation = false, ...options }: ProviderOptions = {},
): Promise<RenderResult & { queryClient: QueryClient }> {
  const client = queryClient ?? testQueryClient();
  const i18n = await testI18n(locale);

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          {withNavigation ? <NavigationContainer>{children}</NavigationContainer> : children}
        </ThemeProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );

  // React 19 renders the root concurrently, so RNTL's `render` resolves once
  // the tree has committed rather than returning it outright.
  const result = await render(ui, { wrapper: Wrapper, ...options });
  return { ...result, queryClient: client };
}
