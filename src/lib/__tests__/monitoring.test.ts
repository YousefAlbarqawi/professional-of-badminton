/**
 * BUILD-SPEC 23.4 has two halves and the second is the one worth a test:
 * "Sentry for crashes and unhandled promise rejections… No analytics SDK, no
 * tracking, no advertising identifiers."
 *
 * Sentry's defaults collect a good deal more than crashes — sessions, spans,
 * screenshots, view hierarchies. Every one of those is turned off explicitly in
 * `monitoring.ts`, and every one of those is a default that a minor version
 * could flip back. So these assert on the options object, which is the only
 * place the difference between "crash reporting" and "an analytics SDK" is
 * written down.
 */
import type * as SentryModule from '@sentry/react-native';

import type * as MonitoringModule from '../monitoring';

type Monitoring = typeof MonitoringModule;

interface Loaded {
  monitoring: Monitoring;
  init: jest.MockedFunction<typeof SentryModule.init>;
  captureException: jest.MockedFunction<typeof SentryModule.captureException>;
}

/**
 * A fresh module registry, so `initMonitoring`'s once-only latch resets and
 * `config` re-reads the environment.
 *
 * Sentry is re-required from inside the same reset registry and handed back
 * with the module: after `resetModules` the mock this file imported at the top
 * would be a different object from the one `monitoring.ts` just bound to, and
 * asserting on it would assert on nothing.
 *
 * `require` rather than `import()`, because a dynamic import is not rewritten
 * to a synchronous fetch by this preset and would need
 * `--experimental-vm-modules`.
 */
function loadWithDsn(dsn: string, environment = 'production'): Loaded {
  jest.resetModules();
  process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
  process.env.EXPO_PUBLIC_ENVIRONMENT = environment;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const sentry = require('@sentry/react-native') as typeof SentryModule;
  const monitoring = require('../monitoring') as Monitoring;
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    monitoring,
    init: sentry.init as jest.MockedFunction<typeof SentryModule.init>,
    captureException: sentry.captureException as jest.MockedFunction<
      typeof SentryModule.captureException
    >,
  };
}

const REAL_DSN = 'https://public@o0.ingest.sentry.io/1';

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  process.env.EXPO_PUBLIC_ENVIRONMENT = 'development';
});

describe('without a DSN', () => {
  it('does not start Sentry at all', () => {
    const { monitoring, init: initMock } = loadWithDsn('');

    expect(monitoring.isMonitoringEnabled()).toBe(false);
    expect(monitoring.initMonitoring()).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
  });

  it('makes reportError a no-op rather than a throw', () => {
    const { monitoring, captureException } = loadWithDsn('');

    expect(() => monitoring.reportError(new Error('boom'))).not.toThrow();
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('with a DSN', () => {
  it('starts once, however many times it is called', () => {
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN);

    expect(monitoring.initMonitoring()).toBe(true);
    expect(monitoring.initMonitoring()).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('enables native crash handling and unhandled rejection tracking. 23.4', () => {
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN);
    monitoring.initMonitoring();

    const options = initMock.mock.calls[0]?.[0];
    expect(options?.dsn).toBe(REAL_DSN);
    expect(options?.enableNative).toBe(true);
    expect(options?.enableNativeCrashHandling).toBe(true);
    expect(options?.patchGlobalPromise).toBe(true);
  });

  it('collects nothing that would make it an analytics SDK. 23.4', () => {
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN);
    monitoring.initMonitoring();

    const options = initMock.mock.calls[0]?.[0];
    expect(options?.tracesSampleRate).toBe(0);
    expect(options?.profilesSampleRate).toBe(0);
    expect(options?.enableAutoSessionTracking).toBe(false);
    expect(options?.enableNativeFramesTracking).toBe(false);
    expect(options?.sendDefaultPii).toBe(false);
  });

  it('never uploads a screenshot or a view hierarchy', () => {
    // A crash on the Money tab would otherwise carry a picture of who owes
    // what; one on the CliQ step, a picture of a bank transfer.
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN);
    monitoring.initMonitoring();

    const options = initMock.mock.calls[0]?.[0];
    expect(options?.attachScreenshot).toBe(false);
    expect(options?.attachViewHierarchy).toBe(false);
  });

  it('strips the data off a navigation breadcrumb', () => {
    // Route params in this app are booking ids, player ids and session ids.
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN);
    monitoring.initMonitoring();

    const beforeBreadcrumb = initMock.mock.calls[0]?.[0]?.beforeBreadcrumb;
    const navigation = {
      category: 'navigation',
      data: { to: 'SessionDetail', sessionId: 'a-real-id' },
    };

    expect(beforeBreadcrumb?.(navigation, {})).toEqual({
      category: 'navigation',
      data: undefined,
    });
  });

  it('leaves a non-navigation breadcrumb alone', () => {
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN);
    monitoring.initMonitoring();

    const beforeBreadcrumb = initMock.mock.calls[0]?.[0]?.beforeBreadcrumb;
    const http = { category: 'http', data: { status_code: 500 } };

    expect(beforeBreadcrumb?.(http, {})).toEqual(http);
  });

  it('stays quiet in a development build', () => {
    // A developer's stack traces are not the academy's to store.
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN, 'development');
    monitoring.initMonitoring();

    expect(initMock.mock.calls[0]?.[0]?.enabled).toBe(false);
  });

  it('sends in a production build', () => {
    const { monitoring, init: initMock } = loadWithDsn(REAL_DSN, 'production');
    monitoring.initMonitoring();

    expect(initMock.mock.calls[0]?.[0]?.enabled).toBe(true);
    expect(initMock.mock.calls[0]?.[0]?.environment).toBe('production');
  });

  it('reports a handled error once started', () => {
    const { monitoring, captureException } = loadWithDsn(REAL_DSN);
    monitoring.initMonitoring();

    const error = new Error('boom');
    monitoring.reportError(error, { boundary: 'app-root' });

    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { boundary: 'app-root' },
    });
  });
});
