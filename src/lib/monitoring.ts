/**
 * Crash reporting. BUILD-SPEC 23.4.
 *
 * "Sentry for crashes and unhandled promise rejections. Supabase logs for RPC
 * failures. No analytics SDK, no tracking, no advertising identifiers."
 *
 * That sentence is the whole brief, and the second half of it constrains this
 * file more than the first. Everything Sentry can do beyond a stack trace is
 * turned off here explicitly rather than left at its default, because a
 * default that changes in a minor version would turn this into the analytics
 * SDK 23.4 forbids without anybody editing a line:
 *
 * - `tracesSampleRate: 0` and `profilesSampleRate: 0` — performance monitoring
 *   is tracking, and 23.4 asks for crashes.
 * - `enableAutoSessionTracking: false` — a session is a usage metric.
 * - `sendDefaultPii: false` — the academy knows who its players are; Sentry
 *   does not need to.
 * - `attachScreenshot` and `attachViewHierarchy` are off. A crash on the review
 *   screen would otherwise upload a picture of who owes what, and a crash on
 *   the CliQ step a picture of somebody's bank transfer.
 * - No user is ever set on the scope. A crash report carries a stack, not a
 *   name. This is also why `beforeBreadcrumb` drops navigation breadcrumbs:
 *   the route params in this app are booking and player ids.
 *
 * Unhandled promise rejections come free: `patchGlobalPromise` defaults to true
 * and is left there, which is the mechanism 23.4's second clause names.
 *
 * ── When it is off ───────────────────────────────────────
 * Without `EXPO_PUBLIC_SENTRY_DSN` this does nothing at all and says so. A dev
 * build with no DSN must not queue events, and a developer's stack traces are
 * not the client's to store. `isMonitoringEnabled` is exported so a test can
 * assert the off state rather than infer it.
 */
import * as Sentry from '@sentry/react-native';

import { config, isProduction } from './config';

/** True only when a DSN was supplied at build time. */
export const isMonitoringEnabled = (): boolean => config.sentryDsn !== '';

let isInitialised = false;

/**
 * Start Sentry, once. Called from the app root before anything renders, so a
 * crash during startup is still reported.
 *
 * Returns whether it actually started, so the caller — and a test — can tell
 * "off because there is no DSN" from "on".
 */
export function initMonitoring(): boolean {
  if (isInitialised) return true;
  if (!isMonitoringEnabled()) return false;

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.environment,

    // 23.4: crashes and unhandled rejections. Nothing else.
    enableNative: true,
    enableNativeCrashHandling: true,
    patchGlobalPromise: true,

    // Not analytics. Not tracking. Not advertising.
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    enableAutoSessionTracking: false,
    enableNativeFramesTracking: false,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,

    // A dev build reports through the console, which a developer is already
    // reading. Sending would mix his stack traces into the academy's project.
    enabled: isProduction,

    // Route names are fine; the params beside them are booking ids, player ids
    // and session ids, and a breadcrumb is not the place for any of them.
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category !== 'navigation') return breadcrumb;
      // The key is removed rather than set to undefined: `strict` plus
      // `exactOptionalPropertyTypes` treats an explicit undefined as a value.
      const { data: _dropped, ...withoutData } = breadcrumb;
      return withoutData;
    },
  });

  isInitialised = true;
  return true;
}

/**
 * Report an error that was caught and handled, so it does not reach a crash
 * handler. Used by the root error boundary.
 *
 * A no-op when monitoring is off, which keeps every caller free of a check.
 */
export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!isInitialised) return;
  Sentry.captureException(error, context === undefined ? undefined : { tags: context });
}
