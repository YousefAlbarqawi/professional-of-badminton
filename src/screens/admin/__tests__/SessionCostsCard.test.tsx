/**
 * Per-session costs. BUILD-SPEC 12.1 as amended by migration 0043.
 *
 * The three things worth holding here are the ones that were easy to get
 * wrong: an empty field means "use the rate" and not zero, zero is a real
 * answer the coach needs to be able to give, and the whole card follows 10.2's
 * lock like every other control on the Money tab.
 */
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { SessionCosts } from '@/features/sessions/costTypes';
import type { Fils, Locale } from '@/lib/money';
import { parseInstant } from '@/lib/time';

import { SessionCostsCard } from '../SessionCostsCard';

jest.mock('@/lib/supabase');

const mockCosts = jest.fn();
const mockSetCosts = jest.fn();
const mockAddExtra = jest.fn();
const mockDeleteExtra = jest.fn();

jest.mock('@/features/sessions/costQueries', () => ({
  useSessionCosts: () => mockCosts(),
  useSetSessionCosts: () => ({
    mutate: mockSetCosts,
    isPending: false,
    isError: false,
    error: null,
  }),
  useAddSessionExtraCost: () => ({
    mutate: mockAddExtra,
    isPending: false,
    isError: false,
    error: null,
  }),
  useDeleteSessionExtraCost: () => ({ mutate: mockDeleteExtra, isPending: false }),
}));

/** A Saturday at Khalda: two sessions splitting a 47.500 JD night, one coach. */
function costs(overrides: Partial<SessionCosts> = {}): SessionCosts {
  return {
    sessionId: 's1',
    courtCostDefaultFils: 23750 as Fils,
    coachFeeDefaultFils: 10000 as Fils,
    waterCostDefaultFils: 2000 as Fils,
    courtCostOverrideFils: null,
    coachFeeOverrideFils: null,
    waterCostOverrideFils: null,
    courtCostFils: 23750 as Fils,
    coachFeeFils: 10000 as Fils,
    waterCostFils: 2000 as Fils,
    extrasFils: 0 as Fils,
    costFils: 35750 as Fils,
    extras: [],
    ...overrides,
  };
}

async function render(
  data: SessionCosts = costs(),
  canEdit = true,
  locale: Locale = 'en',
): Promise<RenderResult> {
  mockCosts.mockReturnValue({
    isPending: false,
    isError: false,
    isFetching: false,
    data,
    refetch: jest.fn(),
  });

  return renderWithProviders(<SessionCostsCard sessionId="s1" canEdit={canEdit} />, { locale });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('what the card shows', () => {
  it('breaks the cost into its parts and totals them', async () => {
    const screen = await render();

    expect(screen.getByTestId('costs-court').children.join('')).toBe('23.750 JD');
    expect(screen.getByTestId('costs-coach-fee').children.join('')).toBe('10.000 JD');
    expect(screen.getByTestId('costs-water').children.join('')).toBe('2.000 JD');
    expect(screen.getByTestId('costs-total').children.join('')).toBe('35.750 JD');
  });

  it('keeps the rate visible beside a figure the coach has overridden', async () => {
    // "31.250, and the rate says 23.750" is the whole reason the default is
    // kept alongside the override rather than written over it.
    const screen = await render(
      costs({
        courtCostOverrideFils: 31250 as Fils,
        courtCostFils: 31250 as Fils,
        costFils: 43250 as Fils,
      }),
    );

    expect(screen.getByTestId('costs-court').children.join('')).toBe('31.250 JD');
    expect(screen.getByTestId('costs-court-default').children.join('')).toBe('Rate says 23.750 JD');
    // The two that were not touched say nothing extra.
    expect(screen.queryByTestId('costs-water-default')).toBeNull();
  });

  it('lists the extra lines and folds them into the total', async () => {
    const screen = await render(
      costs({
        extras: [
          {
            id: 'x1',
            kind: 'overtime',
            label: 'stayed 30 min',
            amountFils: 7500 as Fils,
            createdAt: parseInstant('2026-08-22T20:00:00Z'),
          },
          {
            id: 'x2',
            kind: 'snacks',
            label: null,
            amountFils: 3000 as Fils,
            createdAt: parseInstant('2026-08-22T20:05:00Z'),
          },
        ],
        extrasFils: 10500 as Fils,
        costFils: 46250 as Fils,
      }),
    );

    expect(screen.getByText('Extra court time')).toBeTruthy();
    expect(screen.getByText('stayed 30 min')).toBeTruthy();
    expect(screen.getByText('Snacks')).toBeTruthy();
    expect(screen.getByTestId('costs-total').children.join('')).toBe('46.250 JD');
    expect(screen.queryByTestId('costs-extras-empty')).toBeNull();
  });

  it('says so plainly when there is nothing extra', async () => {
    const screen = await render();
    expect(screen.getByTestId('costs-extras-empty')).toBeTruthy();
  });
});

describe('correcting the rated costs', () => {
  it('sends only the fields the coach filled in', async () => {
    // An empty field is "use the rate", which reaches the RPC as null. This is
    // the distinction the whole editor is built around.
    const screen = await render();

    await fireEvent.press(screen.getByTestId('costs-edit'));
    await fireEvent.changeText(screen.getByTestId('costs-field-coach-fee'), '15');
    await fireEvent.press(screen.getByTestId('costs-save'));

    expect(mockSetCosts.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      courtCostFils: null,
      coachFeeFils: 15000,
      waterCostFils: null,
    });
  });

  it('treats zero as an answer, not as an empty field', async () => {
    // The coach does not always bring water. "0" and "no override" must not be
    // the same value, or a session with no water silently costs 2 JD of it.
    const screen = await render();

    await fireEvent.press(screen.getByTestId('costs-edit'));
    await fireEvent.changeText(screen.getByTestId('costs-field-water'), '0');
    await fireEvent.press(screen.getByTestId('costs-save'));

    expect(mockSetCosts.mock.calls[0]?.[0]).toMatchObject({ waterCostFils: 0 });
  });

  it('opens on the overrides already in force, not on the rates', async () => {
    const screen = await render(
      costs({ courtCostOverrideFils: 31250 as Fils, courtCostFils: 31250 as Fils }),
    );

    await fireEvent.press(screen.getByTestId('costs-edit'));

    expect(screen.getByTestId('costs-field-court').props.value).toBe('31.25');
    expect(screen.getByTestId('costs-field-water').props.value).toBe('');
  });

  it('clears every override back to the rates in one tap', async () => {
    const screen = await render(
      costs({
        courtCostOverrideFils: 31250 as Fils,
        waterCostOverrideFils: 0 as Fils,
        courtCostFils: 31250 as Fils,
        waterCostFils: 0 as Fils,
      }),
    );

    await fireEvent.press(screen.getByTestId('costs-edit'));
    await fireEvent.press(screen.getByTestId('costs-use-defaults'));
    await fireEvent.press(screen.getByTestId('costs-save'));

    expect(mockSetCosts.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      courtCostFils: null,
      coachFeeFils: null,
      waterCostFils: null,
    });
  });

  it('refuses a letter in a money field rather than crashing on it', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('costs-edit'));
    await fireEvent.changeText(screen.getByTestId('costs-field-court'), '2a3.7x5');

    expect(screen.getByTestId('costs-field-court').props.value).toBe('23.75');
  });
});

describe('extra lines', () => {
  it('adds one with its kind, amount and note', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('costs-add-extra'));
    await fireEvent.press(screen.getByTestId('costs-extra-kind-shuttlecocks'));
    await fireEvent.changeText(screen.getByTestId('costs-extra-amount'), '4.5');
    await fireEvent.changeText(screen.getByTestId('costs-extra-note'), '2 tubes');
    await fireEvent.press(screen.getByTestId('costs-add-submit'));

    expect(mockAddExtra.mock.calls[0]?.[0]).toEqual({
      sessionId: 's1',
      kind: 'shuttlecocks',
      amountFils: 4500,
      label: '2 tubes',
    });
  });

  it('will not add a line with no amount on it', async () => {
    const screen = await render();

    await fireEvent.press(screen.getByTestId('costs-add-extra'));
    await fireEvent.press(screen.getByTestId('costs-add-submit'));

    expect(mockAddExtra).not.toHaveBeenCalled();
  });

  it('removes one', async () => {
    const screen = await render(
      costs({
        extras: [
          {
            id: 'x1',
            kind: 'other',
            label: null,
            amountFils: 1000 as Fils,
            createdAt: parseInstant('2026-08-22T20:00:00Z'),
          },
        ],
        extrasFils: 1000 as Fils,
      }),
    );

    await fireEvent.press(screen.getByTestId('costs-extra-x1-remove'));

    expect(mockDeleteExtra).toHaveBeenCalledWith({ id: 'x1', sessionId: 's1' });
  });
});

describe('D39, the seven day lock', () => {
  it('renders as a record with no way to change anything', async () => {
    const screen = await render(
      costs({
        extras: [
          {
            id: 'x1',
            kind: 'snacks',
            label: null,
            amountFils: 3000 as Fils,
            createdAt: parseInstant('2026-08-22T20:00:00Z'),
          },
        ],
        extrasFils: 3000 as Fils,
        costFils: 38750 as Fils,
      }),
      false,
    );

    expect(screen.queryByTestId('costs-edit')).toBeNull();
    expect(screen.queryByTestId('costs-add-extra')).toBeNull();
    expect(screen.queryByTestId('costs-extra-x1-remove')).toBeNull();

    // The numbers are still there. It is a record, not a blank.
    expect(screen.getByTestId('costs-total').children.join('')).toBe('38.750 JD');
  });
});

describe('the states 19.3 requires', () => {
  it('shows a skeleton while the costs load', async () => {
    mockCosts.mockReturnValue({ isPending: true, isError: false, isFetching: true });
    const screen = await renderWithProviders(<SessionCostsCard sessionId="s1" canEdit />);

    expect(screen.getByTestId('costs-loading')).toBeTruthy();
  });

  it('shows an error with a retry', async () => {
    mockCosts.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      data: undefined,
      error: new Error('session_not_found'),
      refetch: jest.fn(),
    });
    const screen = await renderWithProviders(<SessionCostsCard sessionId="s1" canEdit />);

    expect(screen.getByTestId('costs-error')).toBeTruthy();
  });
});

describe('Arabic', () => {
  it('names the parts in Arabic with Western digits', async () => {
    const screen = await render(costs(), true, 'ar');

    expect(screen.getByText('تكاليف الجلسة')).toBeTruthy();
    expect(screen.getByTestId('costs-total').children.join('')).toBe('35.750 د.أ');
  });
});
