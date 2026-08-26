import {
  BOOKING_WINDOW_DAYS,
  TZ,
  ammanDayKey,
  ammanEndOfDay,
  ammanMonthKey,
  ammanStartOfDay,
  bookingWindowEnd,
  cancellationCutoff,
  dayKeyToCalendarDate,
  formatClockTime,
  formatMonthLabel,
  formatSessionDate,
  formatSessionTime,
  formatSessionTimeRange,
  isWithinCancellationWindow,
  isWithinReservationWindow,
  nowInAmman,
  formatWeekLabel,
  monthKeyToDate,
  reservationCutoff,
  reviewDeadline,
  shiftMonthKey,
  toAmman,
} from '../time';

/**
 * Jordan is permanently UTC+3, so Amman local time is always UTC + 3 hours.
 * Every instant below is written in UTC and commented with its Amman reading.
 */
const AMMAN_OFFSET_HOURS = 3;

/** 20 August 2026, 14:00 Amman — the worked example in BUILD-SPEC 5.2. */
const NOW = new Date('2026-08-20T11:00:00.000Z');

/** A Khalda Saturday session: 19:00 to 20:30 Amman on 22 August 2026. */
const SESSION_START = new Date('2026-08-22T16:00:00.000Z');
const SESSION_END = new Date('2026-08-22T17:30:00.000Z');

describe('TZ', () => {
  it('is Asia/Amman', () => {
    expect(TZ).toBe('Asia/Amman');
  });

  it('is a fixed UTC+3 offset with no daylight saving', () => {
    // If Jordan ever reintroduced DST this pair would diverge. Section 5.1
    // states it will not, so both January and August must read +3.
    const january = toAmman(new Date('2026-01-15T00:00:00.000Z'));
    const august = toAmman(new Date('2026-08-15T00:00:00.000Z'));
    expect(january.getHours()).toBe(AMMAN_OFFSET_HOURS);
    expect(august.getHours()).toBe(AMMAN_OFFSET_HOURS);
  });
});

describe('nowInAmman', () => {
  it('returns the current instant', () => {
    const before = Date.now();
    const value = nowInAmman().getTime();
    const after = Date.now();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });
});

describe('toAmman', () => {
  it('reads an instant as Amman wall-clock fields', () => {
    const wallClock = toAmman(SESSION_START);
    expect(wallClock.getHours()).toBe(19);
    expect(wallClock.getMinutes()).toBe(0);
    expect(wallClock.getDate()).toBe(22);
  });

  it('accepts an ISO string, which is what Postgres returns', () => {
    expect(toAmman('2026-08-22T16:00:00.000Z').getHours()).toBe(19);
  });

  it('rolls the day forward for a late-evening UTC instant', () => {
    // 22:30 UTC is 01:30 Amman the next morning.
    const wallClock = toAmman(new Date('2026-08-22T22:30:00.000Z'));
    expect(wallClock.getDate()).toBe(23);
    expect(wallClock.getHours()).toBe(1);
  });
});

describe('ammanStartOfDay and ammanEndOfDay', () => {
  it('bracket the Amman day, not the UTC day', () => {
    expect(ammanStartOfDay(NOW).toISOString()).toBe('2026-08-19T21:00:00.000Z');
    expect(ammanEndOfDay(NOW).toISOString()).toBe('2026-08-20T20:59:59.999Z');
  });

  it('is stable for an instant just after Amman midnight', () => {
    // 21:30 UTC on the 19th is 00:30 Amman on the 20th, so the day is the 20th.
    const justAfterMidnight = new Date('2026-08-19T21:30:00.000Z');
    expect(ammanStartOfDay(justAfterMidnight).toISOString()).toBe('2026-08-19T21:00:00.000Z');
  });

  it('is stable for an instant just before Amman midnight', () => {
    // 20:30 UTC on the 20th is 23:30 Amman on the 20th, still the 20th.
    const justBeforeMidnight = new Date('2026-08-20T20:30:00.000Z');
    expect(ammanStartOfDay(justBeforeMidnight).toISOString()).toBe('2026-08-19T21:00:00.000Z');
  });
});

describe('bookingWindowEnd', () => {
  it('is five days inclusive of today', () => {
    expect(BOOKING_WINDOW_DAYS).toBe(5);
  });

  it('reproduces the worked example in section 5.2', () => {
    // Now is 20 August 14:00 Amman. Visible: 20, 21, 22, 23, 24. Not 25.
    const end = bookingWindowEnd(NOW);
    expect(ammanDayKey(end)).toBe('2026-08-24');
    expect(end.toISOString()).toBe('2026-08-24T20:59:59.999Z');
  });

  it('includes a session on the fifth day and excludes the sixth', () => {
    const end = bookingWindowEnd(NOW).getTime();
    const saturdayEvening = new Date('2026-08-24T16:00:00.000Z'); // 24th, 19:00 Amman
    const sundayEvening = new Date('2026-08-25T16:00:00.000Z'); // 25th, 19:00 Amman
    expect(saturdayEvening.getTime()).toBeLessThan(end);
    expect(sundayEvening.getTime()).toBeGreaterThan(end);
  });

  it('matches the Postgres guard of current_date + 4 days', () => {
    // create_booking rejects session_date > current_date + interval '4 days',
    // so the last bookable day starts exactly four days after today does.
    const lastDay = ammanStartOfDay(bookingWindowEnd(NOW));
    const startOfToday = ammanStartOfDay(NOW);
    const daysSpanned = Math.round((lastDay.getTime() - startOfToday.getTime()) / 86_400_000);
    expect(daysSpanned).toBe(4);
  });

  it('does not shift when today is measured just after Amman midnight', () => {
    const justAfterMidnight = new Date('2026-08-19T21:30:00.000Z'); // 20th, 00:30
    expect(ammanDayKey(bookingWindowEnd(justAfterMidnight))).toBe('2026-08-24');
  });
});

describe('reservationCutoff', () => {
  it('is one hour before the session starts', () => {
    expect(reservationCutoff(SESSION_START).toISOString()).toBe('2026-08-22T15:00:00.000Z');
  });

  it('is open at 1h01m out and closed at 59m out', () => {
    const oneHourOneMinuteOut = new Date('2026-08-22T14:59:00.000Z');
    const fiftyNineMinutesOut = new Date('2026-08-22T15:01:00.000Z');
    expect(isWithinReservationWindow(SESSION_START, oneHourOneMinuteOut)).toBe(true);
    expect(isWithinReservationWindow(SESSION_START, fiftyNineMinutesOut)).toBe(false);
  });

  it('is closed exactly on the boundary', () => {
    expect(isWithinReservationWindow(SESSION_START, reservationCutoff(SESSION_START))).toBe(false);
  });
});

describe('cancellationCutoff', () => {
  it('is three hours before the session starts', () => {
    expect(cancellationCutoff(SESSION_START).toISOString()).toBe('2026-08-22T13:00:00.000Z');
  });

  it('allows cancellation at 3h01m and refuses it at 2h59m', () => {
    // The exact boundary pair section 19.1 asks for.
    const threeHoursOneMinute = new Date('2026-08-22T12:59:00.000Z');
    const twoHoursFiftyNine = new Date('2026-08-22T13:01:00.000Z');
    expect(isWithinCancellationWindow(SESSION_START, threeHoursOneMinute)).toBe(true);
    expect(isWithinCancellationWindow(SESSION_START, twoHoursFiftyNine)).toBe(false);
  });

  it('is closed exactly on the boundary', () => {
    expect(isWithinCancellationWindow(SESSION_START, cancellationCutoff(SESSION_START))).toBe(
      false,
    );
  });

  it('closes before the reservation cutoff, never after', () => {
    expect(cancellationCutoff(SESSION_START).getTime()).toBeLessThan(
      reservationCutoff(SESSION_START).getTime(),
    );
  });
});

describe('reviewDeadline', () => {
  it('is seven days after the session ends', () => {
    expect(reviewDeadline(SESSION_END).toISOString()).toBe('2026-08-29T17:30:00.000Z');
  });
});

describe('a device clock that is wrong', () => {
  it('changes nothing that is not passed in explicitly', () => {
    // Every cutoff helper is a pure function of the instants handed to it, so
    // a phone reporting the wrong time can only mislead its own UI. The server
    // re-validates with its own clock. Section 5.1.
    const phoneIsFourHoursSlow = new Date('2026-08-22T11:00:00.000Z');
    const truth = new Date('2026-08-22T15:00:00.000Z');

    expect(isWithinReservationWindow(SESSION_START, phoneIsFourHoursSlow)).toBe(true);
    expect(isWithinReservationWindow(SESSION_START, truth)).toBe(false);
    // The cutoff itself never moved.
    expect(reservationCutoff(SESSION_START).toISOString()).toBe('2026-08-22T15:00:00.000Z');
  });
});

describe('ammanDayKey', () => {
  it('matches the session_date column for an evening session', () => {
    expect(ammanDayKey(SESSION_START)).toBe('2026-08-22');
  });

  it('uses the Amman day for a session ending after UTC midnight', () => {
    // Shmeisani Tuesday runs to 23:00 Amman, which is 20:00 UTC — same day.
    // A hypothetical 01:00 Amman instant is the previous day in UTC.
    expect(ammanDayKey(new Date('2026-08-22T22:00:00.000Z'))).toBe('2026-08-23');
  });
});

describe('dayKeyToCalendarDate', () => {
  it('reads the local calendar fields, not an Amman-converted instant', () => {
    const date = dayKeyToCalendarDate('2026-11-20');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(20);
  });

  it('handles a single digit month and day', () => {
    const date = dayKeyToCalendarDate('2026-01-05');
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
  });
});

describe('formatSessionTime', () => {
  it('formats English as 12 hour with AM and PM', () => {
    expect(formatSessionTime(SESSION_START, 'en')).toBe('7:00 PM');
    expect(formatSessionTime(SESSION_END, 'en')).toBe('8:30 PM');
    expect(formatSessionTime(new Date('2026-08-22T07:30:00.000Z'), 'en')).toBe('10:30 AM');
  });

  it('formats Arabic with صباحاً and مساءً', () => {
    expect(formatSessionTime(SESSION_START, 'ar')).toBe('7:00 مساءً');
    expect(formatSessionTime(new Date('2026-08-22T07:30:00.000Z'), 'ar')).toBe('10:30 صباحاً');
  });

  it('uses Western digits in Arabic', () => {
    // BUILD-SPEC 16.1, stated for times as well as money.
    expect(formatSessionTime(SESSION_START, 'ar')).toMatch(/^[0-9]/);
  });

  it('handles noon and midnight', () => {
    const noon = new Date('2026-08-22T09:00:00.000Z'); // 12:00 Amman
    const midnight = new Date('2026-08-21T21:00:00.000Z'); // 00:00 Amman
    expect(formatSessionTime(noon, 'en')).toBe('12:00 PM');
    expect(formatSessionTime(noon, 'ar')).toBe('12:00 مساءً');
    expect(formatSessionTime(midnight, 'en')).toBe('12:00 AM');
    expect(formatSessionTime(midnight, 'ar')).toBe('12:00 صباحاً');
  });
});

describe('formatSessionDate', () => {
  it('uses English month names', () => {
    expect(formatSessionDate(SESSION_START, 'en')).toBe('22 August 2026');
  });

  it('uses Levantine month names, not transliterated Gregorian ones', () => {
    // BUILD-SPEC 16.1.
    expect(formatSessionDate(SESSION_START, 'ar')).toBe('22 آب 2026');
    expect(formatSessionDate(new Date('2026-01-15T12:00:00.000Z'), 'ar')).toBe(
      '15 كانون الثاني 2026',
    );
    expect(formatSessionDate(new Date('2026-10-15T12:00:00.000Z'), 'ar')).toBe(
      '15 تشرين الأول 2026',
    );
    expect(formatSessionDate(new Date('2026-12-15T12:00:00.000Z'), 'ar')).toBe(
      '15 كانون الأول 2026',
    );
  });

  it('uses the Amman day, not the UTC day', () => {
    expect(formatSessionDate(new Date('2026-08-22T22:00:00.000Z'), 'en')).toBe('23 August 2026');
  });
});

describe('formatSessionTimeRange', () => {
  it('renders the full range for a standard session', () => {
    expect(formatSessionTimeRange(SESSION_START, SESSION_END, 'en')).toBe('7:00 PM – 8:30 PM');
    expect(formatSessionTimeRange(SESSION_START, SESSION_END, 'ar')).toBe(
      '7:00 مساءً – 8:30 مساءً',
    );
  });
});

/**
 * The report month, BUILD-SPEC 15.12. A month is a label on a calendar rather
 * than a span of time, which is why `shiftMonthKey` does arithmetic on the
 * key's own integers: 31 January plus one month has no answer as a Date, and
 * needs none as a key.
 */
describe('ammanMonthKey', () => {
  it('is the Amman month, not the UTC month', () => {
    // 23:30 UTC on 31 July is 02:30 Amman on 1 August.
    expect(ammanMonthKey(new Date('2026-07-31T23:30:00.000Z'))).toBe('2026-08');
    expect(ammanMonthKey(SESSION_START)).toBe('2026-08');
  });
});

describe('shiftMonthKey', () => {
  it('steps back and forward a month at a time', () => {
    expect(shiftMonthKey('2026-08', -1)).toBe('2026-07');
    expect(shiftMonthKey('2026-08', 1)).toBe('2026-09');
  });

  it('crosses a year boundary in both directions', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-06', -18)).toBe('2024-12');
  });

  it('is its own inverse', () => {
    expect(shiftMonthKey(shiftMonthKey('2026-03', -1), 1)).toBe('2026-03');
  });

  it('never produces a 31 January problem', () => {
    // A Date would have answered "3 March" here.
    expect(shiftMonthKey('2026-01', 1)).toBe('2026-02');
  });

  it('refuses anything that is not a month key', () => {
    expect(() => shiftMonthKey('2026-13', 1)).toThrow();
    expect(() => shiftMonthKey('August', 1)).toThrow();
  });

  it('orders as a string, which is what the picker compares', () => {
    expect('2026-08' > '2026-07').toBe(true);
    expect('2026-01' > '2025-12').toBe(true);
  });
});

describe('monthKeyToDate', () => {
  it('is the first of the month, which is what the report RPCs take', () => {
    expect(monthKeyToDate('2026-08')).toBe('2026-08-01');
  });
});

describe('formatMonthLabel', () => {
  it('uses English month names', () => {
    expect(formatMonthLabel('2026-08', 'en')).toBe('August 2026');
  });

  it('uses Levantine month names and Western digits', () => {
    // BUILD-SPEC 16.1, and the C1 conflict at the end of BUILD-SPEC.md.
    expect(formatMonthLabel('2026-08', 'ar')).toBe('آب 2026');
    expect(formatMonthLabel('2026-01', 'ar')).toBe('كانون الثاني 2026');
  });
});

describe('formatWeekLabel', () => {
  it('renders the Sunday a week is keyed by', () => {
    expect(formatWeekLabel('2026-07-05', 'en')).toBe('5 July');
    expect(formatWeekLabel('2026-07-05', 'ar')).toBe('5 تموز');
  });

  it('reads the day in Amman, so a key never slips backwards', () => {
    expect(formatWeekLabel('2026-08-02', 'en')).toBe('2 August');
  });
});

describe('formatClockTime', () => {
  it('renders a template start time the way every other time renders', () => {
    expect(formatClockTime('19:00:00', 'en')).toBe('7:00 PM');
    expect(formatClockTime('19:00:00', 'ar')).toBe('7:00 مساءً');
    expect(formatClockTime('09:30:00', 'en')).toBe('9:30 AM');
  });

  it('handles both noons', () => {
    expect(formatClockTime('12:00', 'en')).toBe('12:00 PM');
    expect(formatClockTime('00:00', 'en')).toBe('12:00 AM');
  });

  it('refuses an hour that is not one', () => {
    expect(() => formatClockTime('25:00', 'en')).toThrow();
  });
});
