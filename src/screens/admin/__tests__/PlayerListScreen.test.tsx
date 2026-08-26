/**
 * The player list. BUILD-SPEC 15.7.
 *
 * The filters are asserted on what they *send*, not on what comes back: the
 * filtering is `search_players`' job (migration 0031), because two of the four
 * are sums over other tables. What this screen owes is the right question.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { DirectoryPlayer } from '@/features/players/types';
import type { Fils, Locale } from '@/lib/money';

import { PlayerListScreen } from '../PlayerListScreen';

jest.mock('@/lib/supabase');

const mockDirectory = jest.fn();

jest.mock('@/features/players/queries', () => ({
  playerKeys: { all: ['players'] },
  usePlayerDirectory: (filters: unknown) => mockDirectory(filters),
}));

const PLAYERS: DirectoryPlayer[] = [
  {
    id: 'p1',
    fullName: 'Ahmad Nasser',
    tier: 'B+',
    visibility: 'level_0',
    credits: 27,
    creditExpires: '2026-11-20',
    owedFils: 8000 as Fils,
  },
  {
    id: 'p2',
    fullName: 'Lina Haddad',
    tier: null,
    visibility: 'level_2',
    credits: 0,
    creditExpires: null,
    owedFils: 0 as Fils,
  },
];

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

interface Setup {
  players?: DirectoryPlayer[];
  /** One entry per page, in `search_players`' cursor shape (migration 0041). */
  pages?: DirectoryPlayer[][];
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
}

/** Reset in `renderScreen`, so a test can assert on it after rendering. */
let fetchNextPage = jest.fn();

async function renderScreen(options: Setup = {}, locale: Locale = 'en'): Promise<RenderResult> {
  const pages = options.pages ?? [options.players ?? PLAYERS];
  fetchNextPage = jest.fn();

  mockDirectory.mockReturnValue({
    data:
      options.isError === true
        ? undefined
        : {
            pages: pages.map((players) => ({ players, nextCursor: null })),
            pageParams: pages.map(() => null),
          },
    isPending: options.isPending ?? false,
    isError: options.isError ?? false,
    isFetching: options.isFetching ?? false,
    isFetchingNextPage: options.isFetchingNextPage ?? false,
    hasNextPage: options.hasNextPage ?? false,
    fetchNextPage,
    error: options.isError === true ? new Error('boom') : null,
    refetch: jest.fn(),
  });

  return renderWithProviders(
    <PlayerListScreen
      route={{ key: 'k', name: 'PlayerList', params: undefined } as never}
      navigation={navigation as never}
    />,
    { locale },
  );
}

/** The filters as they stood on the most recent render. */
function lastFilters(): Record<string, unknown> {
  const calls = mockDirectory.mock.calls;
  return calls[calls.length - 1]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('15.7 the row', () => {
  it('shows the name, the tier, the visibility level and the credits', async () => {
    const screen = await renderScreen();

    expect(screen.getByText('Ahmad Nasser')).toBeTruthy();
    expect(screen.getByText('B+')).toBeTruthy();
    expect(screen.getByText('Level 0')).toBeTruthy();
    expect(screen.getByText('27 credits')).toBeTruthy();
  });

  it('shows what he owes only when it is not zero', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('player-owed-p1').children.join('')).toBe('Owes 8.000 JD');
    expect(screen.queryByTestId('player-owed-p2')).toBeNull();
  });

  it('marks an unrated player rather than guessing a tier. A11', async () => {
    const screen = await renderScreen();
    expect(screen.getByText('Unrated')).toBeTruthy();
  });

  it('opens his profile, which is the route to 15.9 and 15.10', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('player-p1'));

    expect(navigation.navigate).toHaveBeenCalledWith('PlayerProfile', { playerId: 'p1' });
  });
});

describe('15.7 filters and sort', () => {
  it('asks the server for the typed name', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('player-search'), 'ahm');

    expect(lastFilters()).toMatchObject({ query: 'ahm' });
  });

  it('sorts by name, tier or amount owed', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('player-filters-toggle'));
    await fireEvent.press(screen.getByTestId('sort-owed'));
    expect(lastFilters()).toMatchObject({ sort: 'owed' });

    await fireEvent.press(screen.getByTestId('sort-tier'));
    expect(lastFilters()).toMatchObject({ sort: 'tier' });
  });

  it('filters by tier, and pressing the same tier again clears it', async () => {
    // Tri-state: unset is not the same question as "not B+".
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('player-filters-toggle'));
    await fireEvent.press(screen.getByTestId('filter-tier-B+'));
    expect(lastFilters()).toMatchObject({ tier: 'B+' });

    await fireEvent.press(screen.getByTestId('filter-tier-B+'));
    expect(lastFilters()).toMatchObject({ tier: null });
  });

  it('filters by visibility level, by having a subscription, and by owing money', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('player-filters-toggle'));
    await fireEvent.press(screen.getByTestId('filter-visibility-level_2'));
    await fireEvent.press(screen.getByTestId('filter-has-subscription'));
    await fireEvent.press(screen.getByTestId('filter-owes-money'));

    expect(lastFilters()).toMatchObject({
      visibility: 'level_2',
      hasSubscription: true,
      owesMoney: true,
    });
  });

  it('clears every filter but keeps the search text', async () => {
    const screen = await renderScreen();

    await fireEvent.changeText(screen.getByTestId('player-search'), 'lina');
    await fireEvent.press(screen.getByTestId('player-filters-toggle'));
    await fireEvent.press(screen.getByTestId('filter-owes-money'));
    await fireEvent.press(screen.getByTestId('player-clear-filters'));

    expect(lastFilters()).toMatchObject({ query: 'lina', owesMoney: null, tier: null });
  });
});

describe('states', () => {
  it('has a loading state', async () => {
    const screen = await renderScreen({ isPending: true });
    expect(screen.getByTestId('player-list-loading')).toBeTruthy();
  });

  it('has an error state', async () => {
    const screen = await renderScreen({ isError: true });
    expect(screen.getByTestId('player-list-error')).toBeTruthy();
  });

  it('distinguishes an empty academy from an empty filter', async () => {
    const bare = await renderScreen({ players: [] });
    expect(bare.getByText('No players yet.')).toBeTruthy();

    const filtered = await renderScreen({ players: [] });
    await fireEvent.press(filtered.getByTestId('player-filters-toggle'));
    await fireEvent.press(filtered.getByTestId('filter-owes-money'));
    expect(filtered.getByText('No players match those filters.')).toBeTruthy();
  });
});

describe('the directory is paged, migration 0041', () => {
  it('flattens rows across pages in order', async () => {
    const second: DirectoryPlayer = {
      id: 'p3',
      fullName: 'Sami Odeh',
      tier: 'A-',
      visibility: 'level_0',
      credits: 12,
      creditExpires: '2026-10-01',
      owedFils: 0 as Fils,
    };
    const screen = await renderScreen({ pages: [PLAYERS, [second]] });

    expect(screen.getByText('Ahmad Nasser')).toBeTruthy();
    expect(screen.getByText('Lina Haddad')).toBeTruthy();
    expect(screen.getByText('Sami Odeh')).toBeTruthy();
  });

  it('asks for the next page when the list end is reached', async () => {
    const screen = await renderScreen({ hasNextPage: true });

    // FlashList's own layout pass can call onEndReached once on mount in the
    // test renderer, so this asserts the callback fired at least once rather
    // than exactly once.
    screen.getByTestId('player-list').props.onEndReached();

    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('does not ask again while a page is already coming', async () => {
    const screen = await renderScreen({ hasNextPage: true, isFetchingNextPage: true });

    screen.getByTestId('player-list').props.onEndReached();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does nothing once the last page has been seen', async () => {
    const screen = await renderScreen({ hasNextPage: false });

    screen.getByTestId('player-list').props.onEndReached();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('shows a footer while the next page is loading, and not otherwise', async () => {
    const loading = await renderScreen({ hasNextPage: true, isFetchingNextPage: true });
    expect(loading.getByTestId('player-list-loading-more')).toBeTruthy();

    const idle = await renderScreen({ hasNextPage: true, isFetchingNextPage: false });
    expect(idle.queryByTestId('player-list-loading-more')).toBeNull();
  });

  it('does not spin pull-to-refresh while only the next page is loading', async () => {
    // isFetching is true too, since fetching the next page is a kind of
    // fetching — the point is that isFetchingNextPage overrides it here.
    const screen = await renderScreen({
      hasNextPage: true,
      isFetching: true,
      isFetchingNextPage: true,
    });
    const list = screen.getByTestId('player-list');
    expect(list.props.refreshControl.props.refreshing).toBe(false);
  });
});

describe('Arabic', () => {
  it('renders the row in Arabic with Western digits. 16.1', async () => {
    const screen = await renderScreen({}, 'ar');

    expect(screen.getByText('27 زيارة')).toBeTruthy();
    expect(screen.getByText('الدرجة 0')).toBeTruthy();
  });
});

describe('19.3 item 6, the empty state', () => {
  // 15.7's list is filterable four ways and sortable three, so "no matches"
  // is a state the coach will reach by ordinary use rather than by accident.
  it('says so when no player matches', async () => {
    const screen = await renderScreen({ players: [] });

    expect(screen.getByTestId('player-list-empty')).toBeTruthy();
  });
});
