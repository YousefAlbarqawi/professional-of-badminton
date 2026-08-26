/**
 * Toast. 17.4, and the undo window 13.9 asks for.
 *
 * Real timers throughout. Draining Jest's fake clock also drains the
 * `setImmediate` React 19 commits a concurrent render through, which leaves
 * the renderer wedged for every test after the first one that advances it —
 * so the durations here are short and real instead.
 */
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { Toast } from '../Toast';

const onDismiss = jest.fn();
const onAction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Toast', () => {
  it('renders nothing when it is not visible', async () => {
    const screen = await renderWithProviders(
      <Toast isVisible={false} message="Swapped." onDismiss={onDismiss} />,
    );
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('shows the message', async () => {
    const screen = await renderWithProviders(
      <Toast isVisible message="Swapped." onDismiss={onDismiss} />,
    );
    expect(screen.getByText('Swapped.')).toBeTruthy();
  });

  it('runs its action when pressed', async () => {
    const screen = await renderWithProviders(
      <Toast
        isVisible
        message="Swapped."
        actionLabel="Undo"
        onAction={onAction}
        onDismiss={onDismiss}
      />,
    );

    await fireEvent.press(screen.getByTestId('toast-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows no action when only half of the pair is given', async () => {
    const screen = await renderWithProviders(
      <Toast isVisible message="Swapped." actionLabel="Undo" onDismiss={onDismiss} />,
    );
    expect(screen.queryByTestId('toast-action')).toBeNull();
  });

  it('dismisses itself once its window is up', async () => {
    await renderWithProviders(
      <Toast isVisible message="Swapped." onDismiss={onDismiss} durationMs={20} />,
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('stays while the window is still open, so the undo stays reachable', async () => {
    await renderWithProviders(
      <Toast
        isVisible
        message="Swapped."
        actionLabel="Undo"
        onAction={onAction}
        onDismiss={onDismiss}
        durationMs={10000}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
