# Store screenshots

BUILD-SPEC 23.3: "Screenshots in both Arabic and English, for both phone
sizes."

That is **three sets**: `en` and `ar` at App Store 6.9", and `en` and `ar` for
Play. The same six screens in each, so the two languages sit side by side in
the listing and a reader can see the app mirrors properly.

**The App Store 6.5" set is deliberately skipped.** App Store Connect generates
it from the 6.9" set, so the only thing the extra pass buys is a native render
instead of a downscale, on iPhone 11 Pro Max class hardware. 23.3 asks for both
phone sizes; this is the one place the build does not follow it, decided
2026-08-29. If App Store Connect ever marks 6.5" as required at upload, take it
then — the capture recipe below is unchanged.

## Sizes

| Store     | Size  | Pixels                    | Device to capture on        |
| --------- | ----- | ------------------------- | --------------------------- |
| App Store | 6.9"  | 1320 × 2868               | iPhone 17 Pro Max simulator |
| App Store | 6.5"  | 1242 × 2688               | Skipped — see above         |
| Play      | Phone | 1080 × 1920 minimum, 16:9 | Pixel 8 emulator            |

Play needs its own capture rather than a scaled iPhone one: the status bar,
the navigation gesture bar and the system font are all Android's, and a
reviewer can tell.

## The six screens, in order

The order is the order a player meets them, which is also the order that reads
best in a listing.

| #   | Screen         | Spec  | What must be on it                                                                                       |
| --- | -------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| 1   | Schedule       | 14.6  | Two days of sessions, one nearly full and one with room, so the occupancy bar reads at both ends         |
| 2   | Session detail | 14.7  | A level 1 attendee section — tier badges, no names. It shows the privacy model without needing a caption |
| 3   | Booking sheet  | 14.8  | All three payment methods, with the credit option enabled and showing a real remaining count             |
| 4   | My bookings    | 14.9  | Two upcoming reservations, one of them cancellable                                                       |
| 5   | Subscriptions  | 14.13 | A live subscription with credits left and its history beneath                                            |
| 6   | Court board    | 13.10 | Four courts of four, rotation 2 selected. **The coach's screen, and the one that sells the app**         |

Do not screenshot: the Money tab, the player profile, Reports, or anything with
a balance on it. Real amounts owed by named people are not marketing material,
and a fabricated one is a fabricated financial record.

## Rules for the capture

- **Seed data only.** Never a production database. `supabase/seed.sql` has forty
  players with a realistic tier spread and two months of history, which is what
  these screens want.
- **Arabic is not the English screenshot flipped.** Switch the app language and
  capture again: the direction, the Cairo font and the Levantine month names
  are the point of having an Arabic set at all (16.1).
- Check screen 6 in both languages before uploading. The court board is the one
  surface that must **not** mirror (16.2), and a screenshot is where a reviewer
  would notice it had.
- Status bar: full battery, full signal, and a plausible time. The simulator's
  status bar override does this.
- No device frame, no marketing text over the image. The stores prefer plain
  captures and the academy has no brand template to lay over them.

## Blocked

`assets/icon.png` and `assets/splash-icon.png` carry the real logo now
(section 24 question 4 is closed — see `OPEN-ITEMS.md`). What is still missing
is a dev build with them baked in: none of these six screens can be captured
against a build that still has the old icon compiled into it.
