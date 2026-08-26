/**
 * Delete account. BUILD-SPEC 14.14 and App Store guideline 5.1.1(v).
 *
 * The point of these is that nothing is destroyed by a tap. The word has to be
 * typed, and it has to be the word the player can actually see and reproduce on
 * the keyboard he is using.
 */
import React from 'react';
import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Locale } from '@/lib/money';

import { DeleteAccountScreen } from '../DeleteAccountScreen';

jest.mock('@/lib/supabase');

const mockDeleteAccount = jest.fn();

jest.mock('@/features/auth/api', () => ({
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}));

type ScreenProps = React.ComponentProps<typeof DeleteAccountScreen>;

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as unknown as ScreenProps['navigation'];
const route = { key: 'DeleteAccount', name: 'DeleteAccount' } as unknown as ScreenProps['route'];

async function renderScreen(locale: Locale = 'en'): Promise<RenderResult> {
  return renderWithProviders(<DeleteAccountScreen navigation={navigation} route={route} />, {
    locale,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDeleteAccount.mockResolvedValue(undefined);
});

describe('DeleteAccountScreen', () => {
  it('spells out every consequence before offering the button', async () => {
    const view = await renderScreen();

    expect(
      view.getByText(/Every reservation you hold for a future session is cancelled/),
    ).toBeTruthy();
    expect(view.getByText(/is returned to your subscription/)).toBeTruthy();
    expect(view.getByText(/Your name and phone number are removed/)).toBeTruthy();
    expect(view.getByText(/without your name on them/)).toBeTruthy();
    // A1: a balance is not forgiven by deletion.
    expect(view.getByText(/stays between you and him/)).toBeTruthy();
  });

  it('does not delete anything until the word is typed', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('delete-account-start'));

    expect(view.getByTestId('delete-account-dialog-confirm')).toBeDisabled();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('stays disabled for a word that is not the right one', async () => {
    const view = await renderScreen();
    await fireEvent.press(view.getByTestId('delete-account-start'));

    await fireEvent.changeText(view.getByTestId('delete-account-word'), 'DELET');

    expect(view.getByTestId('delete-account-dialog-confirm')).toBeDisabled();
  });

  it('deletes once the word matches', async () => {
    const view = await renderScreen();
    await fireEvent.press(view.getByTestId('delete-account-start'));
    await fireEvent.changeText(view.getByTestId('delete-account-word'), 'DELETE');

    await waitFor(() =>
      expect(view.getByTestId('delete-account-dialog-confirm')).not.toBeDisabled(),
    );

    await fireEvent.press(view.getByTestId('delete-account-dialog-confirm'));

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(1));
  });

  it('forgives the case and stray spaces, not the word', async () => {
    const view = await renderScreen();
    await fireEvent.press(view.getByTestId('delete-account-start'));
    await fireEvent.changeText(view.getByTestId('delete-account-word'), '  delete ');

    await waitFor(() =>
      expect(view.getByTestId('delete-account-dialog-confirm')).not.toBeDisabled(),
    );
  });

  it('says so when the deletion fails, rather than pretending', async () => {
    mockDeleteAccount.mockRejectedValue(new Error('deletion_failed'));
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('delete-account-start'));
    await fireEvent.changeText(view.getByTestId('delete-account-word'), 'DELETE');
    await fireEvent.press(view.getByTestId('delete-account-dialog-confirm'));

    expect(await view.findByTestId('delete-account-error')).toHaveTextContent(
      /The account could not be deleted/,
    );
  });

  it('asks for an Arabic word on an Arabic keyboard', async () => {
    const view = await renderScreen('ar');

    await fireEvent.press(view.getByTestId('delete-account-start'));
    expect(view.getByText('اكتب حذف في الأسفل للتأكيد.')).toBeTruthy();

    // The Latin word must not unlock an Arabic confirmation.
    await fireEvent.changeText(view.getByTestId('delete-account-word'), 'DELETE');
    expect(view.getByTestId('delete-account-dialog-confirm')).toBeDisabled();

    await fireEvent.changeText(view.getByTestId('delete-account-word'), 'حذف');
    await waitFor(() =>
      expect(view.getByTestId('delete-account-dialog-confirm')).not.toBeDisabled(),
    );
  });
});
