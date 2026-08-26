/**
 * DateField. A35's amendment to section 2.1, phase 10 — see OPEN-ITEMS.md.
 *
 * The native module itself is mocked in jest.setup.ts as a bare host View
 * carrying `testID` and `onChange`, so `fireEvent(..., 'change', event, date)`
 * reaches this component's own `handleChange` exactly as the real module
 * would call it. What is under test is this component's platform branching,
 * not the wheel.
 */
import React, { useState } from 'react';
import { fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderWithProviders } from '@/test/renderWithProviders';

import { DateField } from '../DateField';

const onChange = jest.fn();

/** A controlled wrapper, so a committed change is visible in the next render. */
const Controlled: React.FC<{ initial: string; minimumDate?: Date }> = ({
  initial,
  minimumDate,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      label="Expiry"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      doneLabel="Done"
      testID="date-field"
      {...(minimumDate === undefined ? {} : { minimumDate })}
    />
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('closed', () => {
  it('shows the current value, formatted, and no wheel', async () => {
    const screen = await renderWithProviders(<Controlled initial="2026-08-24" />);

    expect(screen.getByTestId('date-field-value').children.join('')).toBe('24 August 2026');
    expect(screen.queryByTestId('date-field-native')).toBeNull();
  });
});

describe('iOS, the default test platform', () => {
  it('opens the wheel on press and commits every tick immediately', async () => {
    const screen = await renderWithProviders(<Controlled initial="2026-08-24" />);

    await fireEvent.press(screen.getByTestId('date-field'));
    expect(screen.getByTestId('date-field-native')).toBeTruthy();

    await fireEvent(screen.getByTestId('date-field-native'), 'change', { type: 'set' }, new Date(2026, 8, 1));

    // Committed without pressing Done — the spinner has no separate confirm.
    expect(onChange).toHaveBeenCalledWith('2026-09-01');
    expect(screen.getByTestId('date-field-value').children.join('')).toBe('1 September 2026');
  });

  it('closes the wheel on Done without changing the value again', async () => {
    const screen = await renderWithProviders(<Controlled initial="2026-08-24" />);

    await fireEvent.press(screen.getByTestId('date-field'));
    await fireEvent.press(screen.getByTestId('date-field-done'));

    expect(screen.queryByTestId('date-field-native')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes a minimum date through to the wheel', async () => {
    const minimumDate = new Date(2026, 7, 21);
    const screen = await renderWithProviders(
      <Controlled initial="2026-08-24" minimumDate={minimumDate} />,
    );

    await fireEvent.press(screen.getByTestId('date-field'));

    expect(screen.getByTestId('date-field-native').props.minimumDate).toBe(minimumDate);
  });
});

describe('Android', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('commits only on "set" and unmounts the dialog either way', async () => {
    const screen = await renderWithProviders(<Controlled initial="2026-08-24" />);

    await fireEvent.press(screen.getByTestId('date-field'));
    expect(screen.getByTestId('date-field-native')).toBeTruthy();

    await fireEvent(screen.getByTestId('date-field-native'), 'change', { type: 'set' }, new Date(2026, 8, 1));

    expect(onChange).toHaveBeenCalledWith('2026-09-01');
    // The system dialog is gone on its own; there is no Done button to press.
    expect(screen.queryByTestId('date-field-native')).toBeNull();
    expect(screen.queryByTestId('date-field-done')).toBeNull();
  });

  it('discards a dismissal', async () => {
    const screen = await renderWithProviders(<Controlled initial="2026-08-24" />);

    await fireEvent.press(screen.getByTestId('date-field'));
    await fireEvent(
      screen.getByTestId('date-field-native'),
      'change',
      { type: 'dismissed' },
      undefined,
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('date-field-native')).toBeNull();
  });
});
