/**
 * NumericInput. BUILD-SPEC 17.3, "NumericInput (money aware)", and 5.3.
 *
 * A money field, not a number field. It holds a string all the way through and
 * hands the caller a string, because the moment an amount becomes a JavaScript
 * number it is a float, and 5.3 is unambiguous: "Never use JavaScript floats
 * for money arithmetic." Conversion happens once, at the form's edge, through
 * `fils()`.
 *
 * What it does beyond `Input`:
 *
 *   - a decimal keypad, and only the characters a dinar amount can contain
 *   - at most three decimal places, because that is what Jordan quotes
 *   - Western digits in both languages (16.1), including Arabic-Indic ones
 *     pasted or typed on an Arabic keyboard, which are folded rather than
 *     rejected — a coach who types ٦ means 6
 *   - the currency suffix as a trailing label, so the field itself stays a
 *     bare number
 */
import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Input, type InputProps } from './Input';
import { Text } from './Text';

export interface NumericInputProps extends Omit<
  InputProps,
  'onChangeText' | 'keyboardType' | 'isSecure' | 'isLTR'
> {
  onChangeText: (value: string) => void;
  /** Already translated. "JD" / "د.أ". */
  suffix?: string;
  /** 10.3's balance entry takes a signed amount; a payment never does. */
  allowsNegative?: boolean;
}

const ARABIC_INDIC_ZERO = 0x0660;

/**
 * Folds Arabic-Indic digits to Western ones and drops everything that cannot
 * appear in a dinar amount. 16.1 keeps digits Western in both languages, so
 * this is a normalisation, not a restriction.
 */
export function normaliseAmount(raw: string, allowsNegative: boolean): string {
  let out = '';
  let hasDot = false;
  let decimals = 0;

  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    const folded =
      code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9
        ? String.fromCharCode(48 + code - ARABIC_INDIC_ZERO)
        : character;

    if (folded === '-' && allowsNegative && out === '') {
      out += folded;
      continue;
    }

    // Arabic keyboards emit U+066B for the decimal separator.
    if ((folded === '.' || folded === '٫') && !hasDot && out !== '' && out !== '-') {
      hasDot = true;
      out += '.';
      continue;
    }

    if (folded >= '0' && folded <= '9') {
      if (hasDot) {
        if (decimals === 3) continue; // 5.3: three decimal places, no more.
        decimals += 1;
      }
      out += folded;
    }
  }

  return out;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  onChangeText,
  suffix,
  allowsNegative = false,
  ...rest
}) => {
  const theme = useTheme();

  const handleChange = useCallback(
    (raw: string): void => onChangeText(normaliseAmount(raw, allowsNegative)),
    [allowsNegative, onChangeText],
  );

  const suffixNode = useMemo(
    () =>
      suffix === undefined ? null : (
        <Text variant="small" tone="tertiary" style={{ paddingTop: theme.spacing.xs }}>
          {suffix}
        </Text>
      ),
    [suffix, theme.spacing.xs],
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Input
        {...rest}
        onChangeText={handleChange}
        // A money amount is a number and reads left to right in both
        // languages, like the phone numbers and emails in 16.2.
        isLTR
        keyboardType={allowsNegative ? 'numbers-and-punctuation' : 'decimal-pad'}
        autoCorrect={false}
      />
      {suffixNode}
    </View>
  );
};

export default NumericInput;
