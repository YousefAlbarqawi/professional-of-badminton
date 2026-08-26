/**
 * The player's announcements. BUILD-SPEC 14.11.
 *
 * The rule this screen exists to get right is the direction one: "text
 * direction detected per message rather than following the app language". So
 * the same two messages are rendered in both app languages and asserted to
 * come out the same way round each time.
 */
import { fireEvent, waitFor, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Announcement } from '@/features/announcements/types';
import type { Locale } from '@/lib/money';

import { AnnouncementsScreen } from '../AnnouncementsScreen';

jest.mock('@/lib/supabase');

const mockAnnouncements = jest.fn();

jest.mock('@/features/announcements/queries', () => ({
  useAnnouncements: () => mockAnnouncements(),
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-08-21T12:00:00Z') };
});

const ARABIC: Announcement = {
  id: 'a-ar',
  body: 'تدريب الجمعة ألغي بسبب الصيانة',
  language: 'ar',
  publishedAt: new Date('2026-08-21T09:00:00Z'),
  pushSentAt: new Date('2026-08-21T09:00:05Z'),
};

const ENGLISH: Announcement = {
  id: 'a-en',
  body: 'Friday session is cancelled for maintenance',
  language: 'en',
  publishedAt: new Date('2026-08-20T12:00:00Z'),
  pushSentAt: new Date('2026-08-20T12:00:05Z'),
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
    data: options.rows ?? [ARABIC, ENGLISH],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...options.query,
  });

  return renderWithProviders(
    <AnnouncementsScreen
      route={{ key: 'k', name: 'AnnouncementList', params: undefined } as never}
      navigation={navigation as never}
    />,
    { locale },
  );
}

const directionOf = (screen: RenderResult, id: string): unknown =>
  screen.getByTestId(`announcement-${id}-body`).props.style;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('14.11, direction per message', () => {
  it('renders an Arabic message right to left in an English app', async () => {
    const screen = await renderScreen({}, 'en');

    expect(directionOf(screen, 'a-ar')).toEqual(
      expect.arrayContaining([expect.objectContaining({ writingDirection: 'rtl' })]),
    );
  });

  it('renders an English message left to right in an Arabic app', async () => {
    const screen = await renderScreen({}, 'ar');

    expect(directionOf(screen, 'a-en')).toEqual(
      expect.arrayContaining([expect.objectContaining({ writingDirection: 'ltr' })]),
    );
  });

  it('gives each message its own direction, in one list', async () => {
    const screen = await renderScreen({}, 'ar');

    expect(directionOf(screen, 'a-ar')).toEqual(
      expect.arrayContaining([expect.objectContaining({ writingDirection: 'rtl' })]),
    );
    expect(directionOf(screen, 'a-en')).toEqual(
      expect.arrayContaining([expect.objectContaining({ writingDirection: 'ltr' })]),
    );
  });
});

describe('14.11, the list', () => {
  it('marks a message this device has not read', async () => {
    const screen = await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('announcement-a-ar-unread')).toBeTruthy();
    });
  });

  it('clears the dot once it has been opened', async () => {
    const screen = await renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('announcement-a-ar-unread')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('announcement-a-ar'));

    await waitFor(() => {
      expect(screen.queryByTestId('announcement-a-ar-unread')).toBeNull();
    });
  });

  it('opens the detail view', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('announcement-a-en'));

    expect(navigation.navigate).toHaveBeenCalledWith('AnnouncementDetail', {
      announcementId: 'a-en',
    });
  });

  it('shows a relative timestamp', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('3 hours ago')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });

  it('has an empty state, with the WhatsApp button D72 asks for', async () => {
    const screen = await renderScreen({ rows: [] });

    expect(screen.getByTestId('announcements-empty')).toBeTruthy();
    expect(screen.getByText('No announcements yet.')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-button')).toBeTruthy();
  });

  it('reads in Arabic', async () => {
    const screen = await renderScreen({ rows: [] }, 'ar');

    expect(screen.getByText('لا توجد إعلانات بعد.')).toBeTruthy();
  });
});

describe('19.3 item 6, the loading and error states', () => {
  // The empty state is forced elsewhere in this file; these two were not.
  it('shows skeletons while loading', async () => {
    const screen = await renderScreen({ query: { isPending: true } });

    expect(screen.getByTestId('announcements-loading')).toBeTruthy();
  });

  it('shows an error state with a retry, and the WhatsApp affordance. D72', async () => {
    const refetch = jest.fn();
    const screen = await renderScreen({
      query: { isError: true, error: new Error('nope'), refetch },
    });

    expect(screen.getByTestId('announcements-error')).toBeTruthy();
    expect(screen.getByText('Message the coach')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});
