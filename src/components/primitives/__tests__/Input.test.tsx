/**
 * Input. BUILD-SPEC 17.3, 17.4 and 16.2.
 *
 * Almost all of this file is about one property, because that property has now
 * been wrong twice in two different ways and the second way was invisible in
 * every test that existed.
 *
 * A `<TextInput>`'s `textAlign` is taken **physically** by React Native — a
 * `<Text>`'s is not, it is mirrored under an RTL layout. The theme carries a
 * value for each (`inputAlignStart` and `alignStart`), and passing a field the
 * `Text` one applies the mirroring correction twice: Arabic types from the
 * left and English from the right, both wrong at once.
 *
 * These assertions read the resolved style rather than a snapshot, so they say
 * what edge the caret is on rather than that the markup has not changed.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, type RenderResult } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import type { Locale } from '@/lib/money';

import { Input } from '../Input';

const onChangeText = jest.fn();

async function renderInput(
  locale: Locale,
  props: Partial<React.ComponentProps<typeof Input>> = {},
): Promise<RenderResult> {
  return renderWithProviders(
    <Input
      label="Email"
      value=""
      onChangeText={onChangeText}
      testID="field"
      {...props}
    />,
    { locale },
  );
}

function styleOf(screen: RenderResult): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByTestId('field').props.style) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('16.2, which edge the caret starts on', () => {
  it('starts an Arabic field on the right', async () => {
    expect(styleOf(await renderInput('ar')).textAlign).toBe('right');
  });

  it('starts an English field on the left', async () => {
    expect(styleOf(await renderInput('en')).textAlign).toBe('left');
  });

  it('never leaves the alignment for the platform to guess', async () => {
    // An unset `textAlign` becomes UIKit's `NSTextAlignmentNatural`, which
    // resolves against the *device's* preferred language rather than the app's
    // chosen one — so an Arabic install on an English phone drifted left.
    expect(styleOf(await renderInput('ar')).textAlign).toBeDefined();
    expect(styleOf(await renderInput('en')).textAlign).toBeDefined();
  });
});

describe('16.2, an address and a number read left to right anywhere', () => {
  it('forces the content direction without moving the field', async () => {
    // `isLTR` is about the characters inside the box, not about which edge the
    // box aligns to. An Arabic form with one field flush left among five flush
    // right is the bug this separation avoids.
    const arabic = styleOf(await renderInput('ar', { isLTR: true }));

    expect(arabic.writingDirection).toBe('ltr');
    expect(arabic.textAlign).toBe('right');
  });

  it('leaves the direction alone for ordinary text', async () => {
    expect(styleOf(await renderInput('ar')).writingDirection).toBeUndefined();
  });
});

describe('an explicit override still wins', () => {
  it('takes the caller’s alignment over the locale’s', async () => {
    expect(styleOf(await renderInput('ar', { textAlign: 'center' })).textAlign).toBe('center');
  });
});

describe('17.3, what the field reports', () => {
  it('shows an error in place of the hint, never both', async () => {
    const screen = await renderInput('en', {
      hint: 'We never share it.',
      errorMessage: 'Enter a valid email address.',
    });

    expect(screen.getByTestId('field-error')).toBeTruthy();
    expect(screen.queryByText('We never share it.')).toBeNull();
  });

  it('forwards focus and blur rather than swallowing them', async () => {
    // react-hook-form marks a field touched on blur, and a field that ate the
    // event would never report what is wrong with it.
    const onBlur = jest.fn();
    const screen = await renderInput('en', { onBlur });

    await fireEvent(screen.getByTestId('field'), 'blur');

    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
