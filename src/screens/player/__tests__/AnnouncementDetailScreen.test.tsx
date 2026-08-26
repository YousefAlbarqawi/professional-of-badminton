/**
 * One announcement, in full. BUILD-SPEC 14.11, and section 18's deep link
 * target for an announcement push.
 *
 * This screen had four states in its source and no suite forcing any of them,
 * which 19.3 item 6 asks for. All four are forced here — loading, error, the
 * soft-deleted arrival, and the message itself — along with 14.11's rule that
 * direction follows the message rather than the app.
 */
import React from 'react';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Announcement } from '@/features/announcements/types';
import type { Locale } from '@/lib/money';

import { AnnouncementDetailScreen } from '../AnnouncementDetailScreen';

jest.mock('@/lib/supabase');

const mockAnnouncement = jest.fn();
const mockMarkRead = jest.fn();

jest.mock('@/features/announcements/queries', () => ({
  useAnnouncement: (id: string) => mockAnnouncement(id),
}));

jest.mock('@/features/announcements/readState', () => ({
  useAnnouncementReadState: () => ({
    markRead: mockMarkRead,
    isRead: () => false,
    readIds: new Set<string>(),
  }),
}));

jest.mock('@/lib/time', () => {
  const actual = jest.requireActual('@/lib/time');
  return { ...actual, nowInAmman: () => actual.parseInstant('2026-08-21T12:00:00Z') };
});

const ENGLISH: Announcement = {
  id: 'a-en',
  body: 'Friday session is cancelled for maintenance',
  language: 'en',
  publishedAt: new Date('2026-08-21T09:00:00Z'),
  pushSentAt: new Date('2026-08-21T09:00:05Z'),
};

const ARABIC: Announcement = {
  id: 'a-ar',
  body: 'تدريب الجمعة ألغي بسبب الصيانة',
  language: 'ar',
  publishedAt: new Date('2026-08-21T09:00:00Z'),
  pushSentAt: null,
};

function queryResult(
  data: Announcement | null | undefined,
  overrides: Record<string, unknown> = {},
) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  };
}

/**
 * The screen's props are a union: 14.11 gives the player this route and 15.11
 * gives staff the same one on a different stack. A test only needs one arm of
 * it, so the pair is built and cast together rather than field by field, which
 * would leave TypeScript matching one arm's navigation against the other's.
 */
type Props = React.ComponentProps<typeof AnnouncementDetailScreen>;

async function renderScreen(locale: Locale = 'en', id = 'a-en'): Promise<RenderResult> {
  const props = {
    route: {
      key: 'AnnouncementDetail',
      name: 'AnnouncementDetail',
      params: { announcementId: id },
    },
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
  } as unknown as Props;

  return renderWithProviders(<AnnouncementDetailScreen {...props} />, { locale });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAnnouncement.mockReturnValue(queryResult(ENGLISH));
});

describe('19.3 item 6, the three states', () => {
  it('shows a skeleton while loading', async () => {
    mockAnnouncement.mockReturnValue(queryResult(undefined, { isPending: true }));

    const screen = await renderScreen();

    expect(screen.getByTestId('announcement-detail-loading')).toBeTruthy();
    expect(screen.queryByTestId('announcement-detail')).toBeNull();
  });

  it('shows an error state with a retry when the read failed', async () => {
    const refetch = jest.fn();
    mockAnnouncement.mockReturnValue(
      queryResult(undefined, { isError: true, error: new Error('nope'), refetch }),
    );

    const screen = await renderScreen();

    expect(screen.getByTestId('announcement-detail-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('says so plainly when the message was deleted after the push. 15.11', async () => {
    // A soft delete "does not recall the push", so this arrival is real.
    mockAnnouncement.mockReturnValue(queryResult(null));

    const screen = await renderScreen();

    expect(screen.getByTestId('announcement-detail-missing')).toBeTruthy();
  });

  // D72 on each state in turn, one render each. A loop would leave a tree in
  // flight between iterations, which RNTL 14 on React 19 reports as an empty
  // tree rather than a race — see the phase 0 observations in BUILD-SPEC.
  it('offers the WhatsApp affordance on the error state. D72', async () => {
    mockAnnouncement.mockReturnValue(
      queryResult(undefined, { isError: true, error: new Error('nope') }),
    );

    const screen = await renderScreen();

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('offers the WhatsApp affordance on the deleted state. D72', async () => {
    mockAnnouncement.mockReturnValue(queryResult(null));

    const screen = await renderScreen();

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });

  it('offers the WhatsApp affordance beside the message itself. 14.11', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Message the coach')).toBeTruthy();
  });
});

describe('the message', () => {
  it('renders the body, selectable', async () => {
    const screen = await renderScreen();

    const body = screen.getByTestId('announcement-detail-body');
    expect(body).toBeTruthy();
    expect(body.props.selectable).toBe(true);
  });

  it('marks it read on arrival, so a deep link clears the dot', async () => {
    await renderScreen();

    expect(mockMarkRead).toHaveBeenCalledWith('a-en');
  });
});

describe('14.11, direction follows the message not the app', () => {
  it('keeps an English notice left to right inside an Arabic app', async () => {
    const screen = await renderScreen('ar', 'a-en');

    const body = screen.getByTestId('announcement-detail-body');
    // `Text` composes its own variant style with the caller's, so the prop is
    // an array and the direction is the last word in it.
    expect(body.props.style).toEqual(
      expect.arrayContaining([{ writingDirection: 'ltr', textAlign: 'left' }]),
    );
  });

  it('keeps an Arabic notice right to left inside an English app', async () => {
    mockAnnouncement.mockReturnValue(queryResult(ARABIC));

    const screen = await renderScreen('en', 'a-ar');

    const body = screen.getByTestId('announcement-detail-body');
    // `Text` composes its own variant style with the caller's, so the prop is
    // an array and the direction is the last word in it.
    expect(body.props.style).toEqual(
      expect.arrayContaining([{ writingDirection: 'rtl', textAlign: 'right' }]),
    );
  });
});
