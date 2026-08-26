/**
 * The root error boundary. BUILD-SPEC 19.3 item 6 and D72.
 *
 * Forcing this state means throwing from a render, which is what these do.
 * React logs a caught error to the console on its way past; the console is
 * silenced per test so a passing run does not look like a failing one.
 */
import React from 'react';
import { Text as RNText } from 'react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { reportError } from '@/lib/monitoring';

import { AppErrorBoundary } from '../AppErrorBoundary';

jest.mock('@/lib/monitoring', () => ({
  reportError: jest.fn(),
  initMonitoring: jest.fn(() => false),
  isMonitoringEnabled: jest.fn(() => false),
}));

const Boom: React.FC<{ shouldThrow: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) throw new Error('render exploded');
  return <RNText>the app</RNText>;
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  jest.clearAllMocks();
});

describe('while nothing has thrown', () => {
  it('renders its children untouched', async () => {
    const screen = await renderWithProviders(
      <AppErrorBoundary>
        <Boom shouldThrow={false} />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('the app')).toBeTruthy();
    expect(screen.queryByTestId('app-error-boundary')).toBeNull();
  });
});

describe('once a render throws', () => {
  it('shows the error state instead of a blank screen', async () => {
    const screen = await renderWithProviders(
      <AppErrorBoundary>
        <Boom shouldThrow />
      </AppErrorBoundary>,
    );

    expect(screen.getByTestId('app-error-boundary')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy();
  });

  it('offers the WhatsApp affordance. D72', async () => {
    const screen = await renderWithProviders(
      <AppErrorBoundary>
        <Boom shouldThrow />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('offers a retry', async () => {
    const screen = await renderWithProviders(
      <AppErrorBoundary>
        <Boom shouldThrow />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('reports the throw to Sentry. 23.4', async () => {
    await renderWithProviders(
      <AppErrorBoundary>
        <Boom shouldThrow />
      </AppErrorBoundary>,
    );

    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { boundary: 'app-root' });
  });

  it('renders the same state in Arabic', async () => {
    const screen = await renderWithProviders(
      <AppErrorBoundary>
        <Boom shouldThrow />
      </AppErrorBoundary>,
      { locale: 'ar' },
    );

    expect(screen.getByText('حدث خطأ ما. حاول مرة أخرى.')).toBeTruthy();
    expect(screen.getByText('راسل الكابتن')).toBeTruthy();
  });
});
