/**
 * Picking a language. BUILD-SPEC 16.1, reached from 14.12's profile.
 *
 * It replaces a single button labelled with the language you were *not* in,
 * which is a toggle wearing a label's clothes: it never said which language
 * was running, and with two languages a toggle and a picker cost the same
 * number of taps anyway.
 *
 * So the row on the profile states the current language and opens this. Both
 * languages are listed; the one already running is greyed out and carries a
 * tick rather than being hidden, because "Arabic, and it is the one you have"
 * is the answer the player came to the row for.
 *
 * The restart conversation is not here. `useChangeLanguage` owns it, because a
 * direction change needs a reload wherever it is asked for — see that file.
 */
import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon, Sheet, Text } from '@/components/primitives';
import type { Locale } from '@/lib/money';
import { useTheme } from '@/theme';

export interface LanguageSheetProps {
  isVisible: boolean;
  /** The language currently running. Rendered inert. */
  current: Locale;
  onSelect: (locale: Locale) => void;
  onClose: () => void;
}

const OPTIONS: readonly { locale: Locale; labelKey: 'language.arabic' | 'language.english' }[] = [
  { locale: 'ar', labelKey: 'language.arabic' },
  { locale: 'en', labelKey: 'language.english' },
];

export const LanguageSheet: React.FC<LanguageSheetProps> = ({
  isVisible,
  current,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const select = useCallback(
    (locale: Locale): void => {
      onClose();
      // After the sheet is dismissed, not before: `changeLanguage` may put an
      // Alert on screen and then reload the app, and a modal still mounted
      // under either of those is a modal that comes back on the next launch.
      onSelect(locale);
    },
    [onClose, onSelect],
  );

  return (
    <Sheet isVisible={isVisible} title={t('language.label')} onClose={onClose} testID="language-sheet">
      {OPTIONS.map(({ locale, labelKey }) => {
        const isCurrent = locale === current;

        return (
          <Pressable
            key={locale}
            onPress={isCurrent ? undefined : () => select(locale)}
            disabled={isCurrent}
            accessibilityRole="button"
            accessibilityLabel={t(labelKey)}
            accessibilityState={{ disabled: isCurrent, selected: isCurrent }}
            {...(isCurrent ? { accessibilityHint: t('language.currentHint') } : {})}
            testID={`language-option-${locale}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              minHeight: theme.minTouchTarget,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radii.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.bgSurface,
              // Greyed out, not hidden: 17.4's disabled treatment, the same
              // one `Button` and `Input` use.
              opacity: isCurrent ? 0.45 : 1,
            }}
          >
            {/* The language's own name, always written in that language, so it
                is legible to somebody who cannot read the other one. */}
            <Text variant="body" style={{ flex: 1 }}>
              {t(labelKey)}
            </Text>
            {isCurrent ? <Icon name="checkmark" size={18} color={theme.colors.accent} /> : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
};

export default LanguageSheet;
