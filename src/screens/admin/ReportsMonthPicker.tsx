/**
 * "Month picker at the top." BUILD-SPEC 15.12.
 *
 * Two arrows and the month between them, rather than a calendar or a dropdown:
 * the coach reads this month, then last month, and almost never a month from a
 * year ago. Stepping is one tap; jumping is not worth a modal.
 *
 * Forward is blocked at the current Amman month. A month that has not started
 * has no sessions, no costs and nothing to report, and letting him walk into
 * an empty screen would look like a fault rather than a boundary.
 *
 * The arrows are labelled "previous" and "next" in words for a screen reader.
 * `flexDirection: 'row'` mirrors their positions under RTL by itself, but a
 * chevron is a character and characters do not mirror, so the glyphs are
 * chosen by direction the same way BookingCard chooses its own.
 */
import React, { useCallback } from 'react';
import { I18nManager, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/primitives';
import { formatMonthLabel, shiftMonthKey } from '@/lib/time';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

export interface ReportsMonthPickerProps {
  /** `yyyy-MM`. */
  month: string;
  /** The current Amman month; the picker never steps past it. */
  currentMonth: string;
  onChange: (month: string) => void;
}

interface ArrowProps {
  glyph: string;
  label: string;
  isDisabled: boolean;
  onPress: () => void;
  testID: string;
}

const Arrow: React.FC<ArrowProps> = ({ glyph, label, isDisabled, onPress, testID }) => {
  const theme = useTheme();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
      style={{
        width: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.bgSurface,
        opacity: isDisabled ? 0.4 : 1,
      }}
    >
      <Text variant="heading" tone={isDisabled ? 'tertiary' : 'primary'}>
        {glyph}
      </Text>
    </Pressable>
  );
};

export const ReportsMonthPicker: React.FC<ReportsMonthPickerProps> = ({
  month,
  currentMonth,
  onChange,
}) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';

  const goBack = useCallback((): void => {
    onChange(shiftMonthKey(month, -1));
  }, [month, onChange]);

  const goForward = useCallback((): void => {
    onChange(shiftMonthKey(month, 1));
  }, [month, onChange]);

  const isAtCurrentMonth = month >= currentMonth;
  const backGlyph = I18nManager.isRTL ? '›' : '‹';
  const forwardGlyph = I18nManager.isRTL ? '‹' : '›';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Arrow
        glyph={backGlyph}
        label={t('admin.reports.month.previous')}
        isDisabled={false}
        onPress={goBack}
        testID="reports-month-previous"
      />

      <Text variant="heading" align="center" testID="reports-month-label">
        {formatMonthLabel(month, locale)}
      </Text>

      <Arrow
        glyph={forwardGlyph}
        label={t('admin.reports.month.next')}
        isDisabled={isAtCurrentMonth}
        onPress={goForward}
        testID="reports-month-next"
      />
    </View>
  );
};

export default ReportsMonthPicker;
