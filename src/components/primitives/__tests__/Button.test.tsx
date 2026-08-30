/**
 * Button. BUILD-SPEC 17.3 and 17.4.
 *
 * This file is about one property, for the same reason `Input`'s is.
 *
 * A label sized to its own text gets the width Android *measured* for the
 * string, and Android measures Cairo's Arabic a few points narrower than it
 * draws it. `تسجيل الدخول` was handed a box it did not fit, wrapped onto a
 * second line, and the button's fixed height hid that line — so the sign-in
 * button read `تسجيل`, which is a different word. Nothing caught it: the
 * string, the accessibility label and the node's own bounds were all correct,
 * and only the pixels were wrong.
 *
 * The fix hands the label the row's width instead of the measured one, so a
 * short measurement can no longer wrap it. These assertions read the resolved
 * style, so they say the label can use the button's width rather than that the
 * markup has not changed.
 */
import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';

import { renderWithProviders } from '@/test/renderWithProviders';

import { Button } from '../Button';

const onPress = jest.fn();

async function labelStyleOf(
  props: Partial<React.ComponentProps<typeof Button>> = {},
): Promise<TextStyle> {
  const screen = await renderWithProviders(
    <Button label="تسجيل الدخول" onPress={onPress} testID="button" {...props} />,
    { locale: 'ar' },
  );
  const label = screen.getByText('تسجيل الدخول');
  return StyleSheet.flatten(label.props.style as TextStyle);
}

describe('Button label width', () => {
  it('lets a full-width label use the whole row', async () => {
    // Without this the label is only as wide as the measurement, which is the
    // bug: too narrow by a few points and the second word wraps out of sight.
    expect((await labelStyleOf({ isFullWidth: true })).flexGrow).toBe(1);
  });

  it('leaves a content-width button alone', async () => {
    // Nothing to take: the button is already sized to this label.
    expect((await labelStyleOf()).flexGrow).toBeUndefined();
  });

  it('leaves an iconed row alone', async () => {
    // The icon and the label have to stay grouped; a label that took the whole
    // row would push the icon to the far edge.
    expect(
      (await labelStyleOf({ isFullWidth: true, icon: 'logo-whatsapp' })).flexGrow,
    ).toBeUndefined();
  });

  it('never lets a label push past the row', async () => {
    expect((await labelStyleOf({ isFullWidth: true })).flexShrink).toBe(1);
  });
});
