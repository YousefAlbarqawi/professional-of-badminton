/**
 * The composer. BUILD-SPEC 15.11 and D69.
 *
 * Four things this screen owes: a language selector defaulting to Arabic, a
 * 2000 character counter, a preview, and a confirmation dialog that states how
 * many devices will receive it.
 */
import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Locale } from '@/lib/money';

import { AnnouncementComposeScreen } from '../AnnouncementComposeScreen';

jest.mock('@/lib/supabase');

const mockPublish = jest.fn();
const mockDeviceCount = jest.fn();

jest.mock('@/features/announcements/mutations', () => ({
  usePublishAnnouncement: () => ({ mutate: mockPublish, isPending: false }),
}));

jest.mock('@/features/announcements/queries', () => ({
  usePushDeviceCount: (enabled: boolean) => mockDeviceCount(enabled),
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-08-21T12:00:00Z') };
});

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function renderScreen(
  options: { draftBody?: string; devices?: number } = {},
  locale: Locale = 'en',
): Promise<RenderResult> {
  mockDeviceCount.mockReturnValue({
    data: options.devices,
    isPending: options.devices === undefined,
    isError: false,
  });

  return renderWithProviders(
    <AnnouncementComposeScreen
      route={
        {
          key: 'k',
          name: 'AnnouncementCompose',
          params: options.draftBody === undefined ? undefined : { draftBody: options.draftBody },
        } as never
      }
      navigation={navigation as never}
    />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('15.11, the composer', () => {
  it('defaults the language selector to Arabic', async () => {
    // D69 and 16.1: Arabic is the default, because most players are Jordanian.
    const screen = await renderScreen();

    expect(screen.getByTestId('announcement-language-ar').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });

  it('counts characters against 2000', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Friday is cancelled');

    expect(screen.getByTestId('announcement-counter').children.join('')).toBe('19 / 2000');
  });

  it('refuses to publish past 2000 characters', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'x'.repeat(2001));

    expect(screen.getByTestId('announcement-publish').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('refuses to publish an empty message', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('announcement-publish').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('previews the message as a player will see it', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('announcement-preview-empty')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Friday is cancelled');

    expect(screen.getByTestId('announcement-preview-body').children.join('')).toBe(
      'Friday is cancelled',
    );
  });

  it('previews an English message left to right even with Arabic selected', async () => {
    // 14.11's rule, and the reason the preview is the player's own card: the
    // direction the coach gets is the one his readers get.
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Friday is cancelled');

    expect(screen.getByTestId('announcement-preview-body').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ writingDirection: 'ltr' })]),
    );
  });
});

describe('15.11, the confirmation dialog', () => {
  it('states how many devices will receive it', async () => {
    const screen = await renderScreen({ devices: 37 });

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Friday is cancelled');
    await fireEvent.press(screen.getByTestId('announcement-publish'));

    expect(screen.getByText('37 devices will receive it. This cannot be recalled.')).toBeTruthy();
  });

  it('counts the devices only once the dialog is open', async () => {
    const screen = await renderScreen({ devices: 37 });

    expect(mockDeviceCount).toHaveBeenCalledWith(false);

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Hello');
    await fireEvent.press(screen.getByTestId('announcement-publish'));

    expect(mockDeviceCount).toHaveBeenLastCalledWith(true);
  });

  it('does not publish until the dialog is confirmed', async () => {
    const screen = await renderScreen({ devices: 3 });

    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Friday is cancelled');
    await fireEvent.press(screen.getByTestId('announcement-publish'));

    expect(mockPublish).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('announcement-confirm-confirm'));

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledTimes(1);
    });
    expect(mockPublish.mock.calls[0]?.[0]).toEqual({
      body: 'Friday is cancelled',
      language: 'ar',
    });
  });

  it('sends the language the coach chose', async () => {
    const screen = await renderScreen({ devices: 3 });

    await fireEvent.press(screen.getByTestId('announcement-language-en'));
    await fireEvent.changeText(screen.getByTestId('announcement-body'), 'Friday is cancelled');
    await fireEvent.press(screen.getByTestId('announcement-publish'));
    await fireEvent.press(screen.getByTestId('announcement-confirm-confirm'));

    await waitFor(() => {
      expect(mockPublish.mock.calls[0]?.[0]).toEqual({
        body: 'Friday is cancelled',
        language: 'en',
      });
    });
  });
});

describe('9.4 step 6, the cancellation prefill', () => {
  it('opens with the draft the cancellation prompt handed it', async () => {
    // A6: cancelling a session sends no push (D31), so the coach is offered
    // this composer instead, "prefilled with the venue, date, and time".
    const draft = 'Khalda on 21 August 2026 at 7:00 – 8:30 PM is cancelled.';
    const screen = await renderScreen({ draftBody: draft, devices: 5 });

    expect(screen.getByTestId('announcement-body').props.value).toBe(draft);
    expect(screen.getByTestId('announcement-counter').children.join('')).toBe(
      `${String(draft.length)} / 2000`,
    );
  });
});

describe('in Arabic', () => {
  it('reads in Arabic', async () => {
    const screen = await renderScreen({ devices: 2 }, 'ar');

    expect(screen.getByText('نشر')).toBeTruthy();
    expect(screen.getByText('معاينة')).toBeTruthy();
  });
});
