/**
 * Extend a subscription. BUILD-SPEC 11.5 and D55.
 *
 * "Only the coach extends, by editing `expires_on` on a non-expired
 * subscription. Editing an expired subscription is blocked."
 *
 * ── Coach, not admin ──────────────────────────────────────
 * D16 gives an admin everything but reports, and names granting among its
 * examples; D55 is written about extension specifically and says only the
 * coach. A list of examples does not overrule a decision about the very action
 * in question, so the button is drawn for the coach alone and
 * `extend_subscription` refuses everyone else with `not_authorized`. An admin
 * therefore never sees a control the server would refuse.
 *
 * ── Why an expired one cannot be extended here ────────────
 * D54: expiry voids unused credits. The nightly job zeroes the ledger and then
 * voids the row, so moving the date forward afterwards would produce a live
 * subscription with nothing in it — or, in the hours before the job runs,
 * credits surviving a date they were meant to die on. The card offers no
 * *Extend* once the subscription is finished, and the server raises
 * `subscription_expired` if anything asks anyway.
 *
 * Mounted only while it is open, so the field starts at the same default every
 * time without an effect resetting it behind the render.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays } from 'date-fns';

import { Button, DateField, Sheet, Text } from '@/components/primitives';
import { addMonths } from '@/features/subscriptions/creditLedger';
import { subscriptionErrorMessageKey } from '@/features/subscriptions/errors';
import { useExtendSubscription } from '@/features/subscriptions/mutations';
import { extendSubscriptionSchema } from '@/features/subscriptions/schemas';
import { ammanDayStart, dayKeyToCalendarDate, formatSessionDate } from '@/lib/time';
import { useTheme } from '@/theme';

export interface ExtendSubscriptionSheetProps {
  subscriptionId: string;
  /** `yyyy-MM-dd`. The new date has to be later than this one. */
  currentExpiresOn: string;
  onClose: () => void;
}

export const ExtendSubscriptionSheet: React.FC<ExtendSubscriptionSheetProps> = ({
  subscriptionId,
  currentExpiresOn,
  onClose,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const extend = useExtendSubscription();

  // A month on is what "extend" usually means, and it is one edit away from
  // anything else. A35's amendment, phase 10 — see OPEN-ITEMS.md.
  const [expiresOn, setExpiresOn] = useState(() => addMonths(currentExpiresOn, 1));

  // The schema already refuses anything not later than the current date; the
  // wheel's own minimum keeps the coach from picking a value it would refuse.
  const minimumDate = useMemo(
    () => addDays(dayKeyToCalendarDate(currentExpiresOn), 1),
    [currentExpiresOn],
  );

  const validation = useMemo(
    () => extendSubscriptionSchema(currentExpiresOn).safeParse({ expiresOn }),
    [currentExpiresOn, expiresOn],
  );

  const submit = useCallback((): void => {
    if (!validation.success) return;
    extend.mutate(
      { subscriptionId, expiresOn: validation.data.expiresOn.trim() },
      { onSuccess: onClose },
    );
  }, [extend, onClose, subscriptionId, validation]);

  const fieldError = validation.success ? undefined : validation.error.issues[0]?.message;

  return (
    <Sheet
      isVisible
      title={t('admin.subs.extendTitle')}
      onClose={onClose}
      isDismissDisabled={extend.isPending}
      testID="extend-sheet"
    >
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body" tone="secondary" testID="extend-current">
          {t('admin.subs.extendCurrent', {
            date: formatSessionDate(ammanDayStart(currentExpiresOn), theme.locale),
          })}
        </Text>

        <DateField
          label={t('admin.subs.extendNewDate')}
          value={expiresOn}
          onChange={setExpiresOn}
          minimumDate={minimumDate}
          doneLabel={t('common.done')}
          {...(fieldError === undefined ? {} : { errorMessage: t(fieldError) })}
          testID="extend-date"
        />

        {extend.isError ? (
          <Text variant="small" tone="danger" testID="extend-error">
            {t(subscriptionErrorMessageKey(extend.error))}
          </Text>
        ) : null}

        <Button
          label={t('admin.subs.extend')}
          onPress={submit}
          isDisabled={!validation.success}
          isLoading={extend.isPending}
          isFullWidth
          testID="extend-submit"
        />
      </View>
    </Sheet>
  );
};

export default ExtendSubscriptionSheet;
