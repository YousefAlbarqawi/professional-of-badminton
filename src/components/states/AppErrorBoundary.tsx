/**
 * The last error state in the app: the one that catches a render that threw.
 *
 * BUILD-SPEC 19.3 item 6 requires every screen to have a reachable error
 * state, and every screen has one for the read that failed. None of them
 * covers a component that throws while rendering, which in a release build is
 * a blank screen and nothing else — no message, no retry, and no way to reach
 * the coach, which D72 says there always must be.
 *
 * So this renders the same `ErrorState` every screen uses, with its WhatsApp
 * button, and reports the throw to Sentry (23.4). Resetting re-renders the
 * tree rather than reloading the app: if the cause was transient the player
 * carries on, and if it was not he sees this screen again, which is honest.
 *
 * A class component because that is the only thing React gives an error
 * boundary. The copy comes through `t()` like everything else, which is why
 * the fallback is a function component underneath.
 */
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/components/states/ErrorState';
import { reportError } from '@/lib/monitoring';
import { useTheme } from '@/theme';

const Fallback: React.FC<{ onReset: () => void }> = ({ onReset }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View
      testID="app-error-boundary"
      style={{
        flex: 1,
        justifyContent: 'center',
        backgroundColor: theme.colors.bg,
        padding: theme.spacing.lg,
      }}
    >
      <ErrorState message={t('error.generic')} onRetry={onReset} testID="app-error-state" />
    </View>
  );
};

export interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public override state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: unknown): void {
    // 23.4. A no-op when there is no DSN, so this needs no guard.
    reportError(error, { boundary: 'app-root' });
  }

  private readonly reset = (): void => this.setState({ hasError: false });

  public override render(): React.ReactNode {
    if (this.state.hasError) return <Fallback onReset={this.reset} />;
    return this.props.children;
  }
}

export default AppErrorBoundary;
