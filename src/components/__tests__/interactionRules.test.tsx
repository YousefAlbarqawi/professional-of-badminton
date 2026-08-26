/**
 * BUILD-SPEC 17.4's first rule and 13.10's last one, held in place.
 *
 * "Minimum touch target 44×44." — 17.4
 * "Minimum font size for player names: 18pt." — 13.10
 *
 * Both are single numbers that anybody can lower by a token edit or by
 * reaching for a smaller typography variant, and neither leaves a trace when
 * they do: a 32pt button still works, and a 14pt name still renders. They only
 * fail at arm's length in a gym, which is not where a regression should be
 * found. So both are asserted here — the tokens themselves, the variants the
 * court board reaches for, and the rendered height of the things a finger
 * actually lands on.
 *
 * The two structural exemptions, deliberately not covered: a modal backdrop
 * (`Sheet`, `Dialog`) is a full-screen dismiss target rather than a control,
 * and `ProofViewer`'s image tap is the whole screen.
 */
import { StyleSheet, type ViewStyle } from 'react-native';

import { Button } from '@/components/primitives/Button';
import { SegmentedControl } from '@/components/primitives/SegmentedControl';
import { Input } from '@/components/primitives/Input';
import { PlayerRow } from '@/components/domain/PlayerRow';
import { TierBadge } from '@/components/domain/TierBadge';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MIN_COURT_NAME_SIZE, MIN_TOUCH_TARGET, typography } from '@/theme';

/** The flattened style of a rendered node, whatever shape the prop arrived in. */
function flatten(style: unknown): ViewStyle {
  return (StyleSheet.flatten(style as ViewStyle) ?? {}) as ViewStyle;
}

describe('17.4, the tokens', () => {
  it('keeps the minimum touch target at 44', () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });
});

describe('13.10, court board legibility', () => {
  it('keeps the minimum player name size at 18', () => {
    expect(MIN_COURT_NAME_SIZE).toBe(18);
  });

  it('draws the first name at or above it', () => {
    // `CourtTile` renders the first name as `courtName`.
    expect(typography.courtName.size).toBeGreaterThanOrEqual(MIN_COURT_NAME_SIZE);
  });

  it('draws the family name at or above it, and smaller than the first', () => {
    // `CourtTile` renders the family name as `heading`. 13.10 asks for
    // "family name smaller" and for a floor, and both have to hold at once.
    expect(typography.heading.size).toBeGreaterThanOrEqual(MIN_COURT_NAME_SIZE);
    expect(typography.heading.size).toBeLessThan(typography.courtName.size);
  });
});

describe('17.4, what a finger lands on', () => {
  it('gives a Button 44 points of height', async () => {
    const screen = await renderWithProviders(
      <Button label="Reserve a spot" onPress={jest.fn()} testID="target" />,
    );

    const style = flatten(screen.getByTestId('target').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('gives a disabled Button the same height', async () => {
    // 14.7 has four states that draw a disabled primary action. A control that
    // shrinks when it is inert is a control that moves under the finger.
    const screen = await renderWithProviders(
      <Button label="Booking closed" onPress={jest.fn()} isDisabled testID="target" />,
    );

    const style = flatten(screen.getByTestId('target').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('gives a SegmentedControl option 44 points of height', async () => {
    const screen = await renderWithProviders(
      <SegmentedControl
        label="Bookings"
        options={[
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
        value="upcoming"
        onChange={jest.fn()}
        testID="target"
      />,
    );

    const style = flatten(screen.getByTestId('target-upcoming').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('gives an Input 44 points of height', async () => {
    const screen = await renderWithProviders(
      <Input label="Email" value="" onChangeText={jest.fn()} testID="target" />,
    );

    // The field is the parent of the TextInput; the touch target is the box.
    const field = flatten(screen.getByTestId('target').parent?.props.style);
    expect(field.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  it('gives a PlayerRow 44 points of height', async () => {
    // The height sits on the row's content view rather than on the Pressable
    // wrapping it, so this looks for it anywhere inside rather than asserting
    // on a shape that is an implementation detail.
    const screen = await renderWithProviders(
      <PlayerRow name="Omar Nasser" tier="A-" onPress={jest.fn()} testID="target" />,
    );

    const heights: number[] = [];
    const walk = (node: { props: Record<string, unknown>; children: unknown[] }): void => {
      const height = flatten(node.props.style).minHeight;
      if (typeof height === 'number') heights.push(height);
      for (const child of node.children) {
        if (typeof child === 'object' && child !== null && 'props' in child) {
          walk(child as { props: Record<string, unknown>; children: unknown[] });
        }
      }
    };
    walk(screen.getByTestId('target') as never);

    expect(Math.max(0, ...heights)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});

describe('17.2, the tier badge', () => {
  it('is at least 28 points, as its own rule says', async () => {
    // Not 44: 17.2 gives the badge its own floor because it is a label, not a
    // control. Where it *is* tapped — the guest tier picker — the wrapper
    // carries the 44, which is asserted with that sheet.
    const screen = await renderWithProviders(<TierBadge tier="B+" testID="badge" />);

    const style = flatten(screen.getByTestId('badge').props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(28);
    expect(style.minHeight).toBeGreaterThanOrEqual(28);
  });
});
