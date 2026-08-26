/**
 * The staff announcement list. BUILD-SPEC 15.11, and the More tab's root.
 *
 * The clause worth asserting is the one a coach will otherwise discover the
 * hard way: a soft delete "does not recall the push", and the confirmation has
 * to say so before he presses it.
 */
import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Announcement } from '@/features/announcements/types';
import type { Locale } from '@/lib/money';

import { AnnouncementListScreen } from '../AnnouncementListScreen';

jest.mock('@/lib/supabase');

const mockAnnouncements = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/features/announcements/queries', () => ({
  useAnnouncements: () => mockAnnouncements(),
}));

jest.mock('@/features/announcements/mutations', () => ({
  useDeleteAnnouncement: () => ({ mutate: mockDelete, isPending: false }),
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-08-21T12:00:00Z') };
});

const SENT: Announcement = {
  id: 'a-sent',
  body: 'Friday session is cancelled',
  language: 'en',
  publishedAt: new Date('2026-08-21T09:00:00Z'),
  pushSentAt: new Date('2026-08-21T09:00:05Z'),
};

const PENDING: Announcement = {
  id: 'a-pending',
  body: 'Courts are booked for Monday',
  language: 'en',
  publishedAt: new Date('2026-08-21T11:59:00Z'),
  pushSentAt: null,
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

/** Anything a TanStack result carries that a state test needs to force. */
interface QueryOverrides {
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  error?: Error | null;
  refetch?: jest.Mock;
}

async function renderScreen(
  options: { rows?: Announcement[]; query?: QueryOverrides } = {},
  locale: Locale = 'en',
): Promise<RenderResult> {
  mockAnnouncements.mockReturnValue({
    data: options.rows ?? [SENT, PENDING],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.query,
  });

  return renderWithProviders(
    <AnnouncementListScreen
      route={{ key: 'k', name: 'AnnouncementList', params: undefined } as never}
      navigation={navigation as never}
    />,
    { locale },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('15.11, the list', () => {
  it('has a compose button', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('announcement-compose-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('AnnouncementCompose');
  });

  it('reaches 14.12 from here, which A28 said phase 8 would arrange', async () => {
    // 23.3 wants account deletion within three taps: More → Settings →
    // Delete my account.
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('announcement-settings-button'));

    expect(navigation.navigate).toHaveBeenCalledWith('Profile');
  });

  it('says whether the push has gone out yet', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Sent to devices')).toBeTruthy();
    expect(screen.getByText('Sending…')).toBeTruthy();
  });
});

describe('15.11, the soft delete', () => {
  it('confirms first, and says the push cannot be recalled', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('admin-announcement-a-sent-delete'));

    expect(
      screen.getByText(
        "It disappears from the players' list. The notification already sent cannot be recalled.",
      ),
    ).toBeTruthy();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('deletes only once confirmed', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('admin-announcement-a-sent-delete'));
    await fireEvent.press(screen.getByTestId('announcement-delete-dialog-confirm'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });
    expect(mockDelete.mock.calls[0]?.[0]).toBe('a-sent');
  });

  it('reads in Arabic', async () => {
    const screen = await renderScreen({}, 'ar');

    await fireEvent.press(screen.getByTestId('admin-announcement-a-sent-delete'));

    expect(screen.getByText('حذف هذا الإعلان؟')).toBeTruthy();
    expect(
      screen.getByText('سيختفي من قائمة اللاعبين. الإشعار الذي أُرسل لا يمكن سحبه.'),
    ).toBeTruthy();
  });
});

describe('19.3 item 6, the three states', () => {
  it('shows skeletons while loading', async () => {
    const screen = await renderScreen({ query: { isPending: true } });

    expect(screen.getByTestId('admin-announcements-loading')).toBeTruthy();
  });

  it('shows an empty state with nothing published yet', async () => {
    const screen = await renderScreen({ rows: [] });

    expect(screen.getByTestId('admin-announcements-empty')).toBeTruthy();
  });

  it('shows an error state with a retry when the read failed', async () => {
    const refetch = jest.fn();
    const screen = await renderScreen({
      query: { isError: true, error: new Error('nope'), refetch },
    });

    expect(screen.getByTestId('admin-announcements-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});
