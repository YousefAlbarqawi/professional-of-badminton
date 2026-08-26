/**
 * The payment method chip. 14.9 asks for one on every My Bookings row and 15.2
 * asks for one on every roster row, so it lives here rather than in either.
 *
 * Colour never carries the meaning on its own — 17.2 makes that point about
 * tier badges and it holds just as well here — so the label is always the
 * method's name in words.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Chip, type ChipTone } from '@/components/primitives';
import type { PaymentMethod } from '@/features/bookings/types';

export interface PaymentMethodChipProps {
  method: PaymentMethod;
  testID?: string | undefined;
}

const LABEL_KEYS: Record<PaymentMethod, string> = {
  cash: 'bookings.methodCash',
  cliq: 'bookings.methodCliq',
  credit: 'bookings.methodCredit',
  free: 'bookings.methodFree',
};

const TONES: Record<PaymentMethod, ChipTone> = {
  cash: 'neutral',
  cliq: 'info',
  credit: 'accent',
  // D45: a free guest contributes no revenue, which is worth seeing at a
  // glance on a roster the coach reads to work out what the night made.
  free: 'warning',
};

export const PaymentMethodChip: React.FC<PaymentMethodChipProps> = ({ method, testID }) => {
  const { t } = useTranslation();

  return <Chip label={t(LABEL_KEYS[method])} tone={TONES[method]} testID={testID} />;
};

export default PaymentMethodChip;
