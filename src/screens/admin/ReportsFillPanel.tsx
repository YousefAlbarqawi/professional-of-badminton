/**
 * BUILD-SPEC 15.12 sections 5 and 6: attendance by slot, and fill rate by
 * venue.
 *
 * "So dying slots are obvious" is section 5's stated purpose, so a slot that
 * ran with half a court shows a short bar next to one that filled, and the
 * percentage is written out beside it.
 *
 * Both sections divide the same two integers the same way, in
 * `features/reports/aggregate.ts`, so a slot's fill and its venue's fill can
 * never be computed differently. One-off sessions (15.6) are not a recurring
 * slot and are absent from section 5; they are in section 6 and in every
 * total, because they really did fill a court.
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FillRateRow, ReportSection } from '@/components/domain';
import { Text } from '@/components/primitives';
import { fillRate, percentLabel, weekdayKey } from '@/features/reports';
import type { SlotAttendance, VenueFill } from '@/features/reports';
import { formatClockTime } from '@/lib/time';
import { useTheme } from '@/theme';

export interface ReportsFillPanelProps {
  slots: SlotAttendance[];
  venues: VenueFill[];
}

export const ReportsFillPanel: React.FC<ReportsFillPanelProps> = ({ slots, venues }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const slotRows = useMemo(
    () =>
      slots.map((slot) => {
        const rate = fillRate(slot.attendeeTotal, slot.capacityTotal);

        return {
          key: slot.templateId,
          label: `${t(weekdayKey(slot.weekday))} ${formatClockTime(slot.startTime, theme.locale)}`,
          detail: t('admin.reports.slots.detail', {
            venue: theme.locale === 'ar' ? slot.venueNameAr : slot.venueNameEn,
            sessions: slot.sessionsRun,
            players: slot.attendeeTotal,
          }),
          rate,
          rateLabel: percentLabel(rate),
          accessibilityLabel: t('admin.reports.fillAccessibility', {
            players: slot.attendeeTotal,
            capacity: slot.capacityTotal,
          }),
        };
      }),
    [slots, t, theme.locale],
  );

  const venueRows = useMemo(
    () =>
      venues.map((venue) => {
        const rate = fillRate(venue.attendeeTotal, venue.capacityTotal);

        return {
          key: venue.venueId,
          label: theme.locale === 'ar' ? venue.venueNameAr : venue.venueNameEn,
          detail: t('admin.reports.venues.detail', {
            sessions: venue.sessionsRun,
            players: venue.attendeeTotal,
          }),
          rate,
          rateLabel: percentLabel(rate),
          accessibilityLabel: t('admin.reports.fillAccessibility', {
            players: venue.attendeeTotal,
            capacity: venue.capacityTotal,
          }),
        };
      }),
    [t, theme.locale, venues],
  );

  return (
    <>
      {/* Section 5 */}
      <ReportSection title={t('admin.reports.slots.title')} testID="report-slots">
        {slotRows.length === 0 ? (
          <Text variant="small" tone="secondary">
            {t('admin.reports.slots.empty')}
          </Text>
        ) : (
          slotRows.map((row) => (
            <FillRateRow
              key={row.key}
              testID={`report-slot-${row.key}`}
              label={row.label}
              detail={row.detail}
              rate={row.rate}
              rateLabel={row.rateLabel}
              accessibilityLabel={row.accessibilityLabel}
            />
          ))
        )}
      </ReportSection>

      {/* Section 6 */}
      <ReportSection title={t('admin.reports.venues.title')} testID="report-venues">
        {venueRows.length === 0 ? (
          <Text variant="small" tone="secondary">
            {t('admin.reports.venues.empty')}
          </Text>
        ) : (
          venueRows.map((row) => (
            <FillRateRow
              key={row.key}
              testID={`report-venue-${row.key}`}
              label={row.label}
              detail={row.detail}
              rate={row.rate}
              rateLabel={row.rateLabel}
              accessibilityLabel={row.accessibilityLabel}
            />
          ))
        )}
      </ReportSection>
    </>
  );
};

export default ReportsFillPanel;
