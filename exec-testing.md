# End-to-end app testing with execbro — session log

Started 2026-08-27. Testing on iOS simulator (iPhone 17, iOS 26.5) via execbro MCP —
physical-device driving isn't supported by execbro's tap/swipe/type automation, only
simulators, so a dev-client build was used instead of the physical iPhone 11.

## Setup notes / environment gotchas
- Custom dev-client build required (native modules: reanimated, flash-list,
  image-picker, datetimepicker, haptics — Expo Go doesn't work).
- First build failed on disk space; after cleanup, hit a Sentry `SENTRY_ORG`
  upload-debug-symbols failure on iOS (same class of bug already fixed for Android's
  `production` profile). Fixed with `SENTRY_DISABLE_AUTO_UPLOAD=true`, mirrored into
  `eas.json`'s iOS `development`/`preview` profiles too.
- Metro's CDP inspector rejected connections with 401 — this is React Native's own
  hardcoded CVE-fix in `@react-native/dev-middleware`, not an app bug. Worked around
  by using coordinate/OCR/accessibility-driven tapping instead of the CDP fiber
  connection, cross-checking backend state directly against local Postgres
  (`supabase status` credentials).

## Bugs found and fixed

### Critical (backend correctness)
- **Session Manage's Players tab and Money tab were completely broken on every
  session.** PostgREST `PGRST201` — ambiguous embed because `bookings` has 3 FKs to
  `profiles` (`player_id`, `created_by`, `cancelled_by`), and `fetchSessionRoster` +
  `fetchSessionReview` didn't specify which one. Fixed by naming the FK explicitly.
  Verified via direct REST calls, on-device, and against the full `supabase/tests`
  integration suite (542/543 pass — the 1 failure was a false positive from manual
  test booking data, not a regression).
- **Every non-centered piece of Arabic text in the entire app was left-aligned
  instead of right-aligned.** `textAlign: 'auto'` resolves via the *device's* OS
  locale (`NSTextAlignment.natural`), not the app's own `I18nManager.isRTL` flag —
  invisible in unit tests, only shows up on a real device/simulator with a
  non-Arabic OS locale, which is exactly this app's real-world scenario (Arabic by
  default regardless of device locale, per BUILD-SPEC 16.1). Fixed at the root in
  the `Text` primitive. Also uncovered along the way: RN auto-mirrors
  `textAlign: 'left'/'right'` under `I18nManager.isRTL`, so `'left'` (not `'right'`)
  is the correct value for reading-start alignment — RN's own mirroring handles the
  flip. This was the single highest-impact fix of the session; documented in
  OPEN-ITEMS.md.

### UI / functional
- Tab bar icons were never wired up — React Navigation's `MissingIcon` debug
  triangle rendered on every tab, both navigators. Added `@expo/vector-icons`
  (Expo's own official package, recorded as a BUILD-SPEC §2.1 amendment matching the
  precedent set for haptics/datetimepicker) and wired real icons everywhere,
  including a WhatsApp icon on `WhatsAppButton`.
- All 4 auth screens' footer links ("Create account", "Sign in", etc.) were
  left-aligned instead of centered — `Button` defaults to `alignSelf: 'flex-start'`
  when not full-width, breaking `AuthLayout`'s centered footer. Fixed on SignIn,
  SignUp, ForgotPassword, VerifyEmail.
- Sessions list card spacing was inconsistent — loading skeleton used
  `spacing.md` (16px) gaps, the real list used `spacing.sm` (8px). Unified to match
  the skeleton.
- `WhatsAppButton` didn't forward a `style` prop, so callers couldn't center it —
  added.
- Missing i18n pluralization across ~10 string keys (session attendee counts,
  credit counts, court counts, booking counts, package duration) — "1 players
  booked" type grammar errors in both English and Arabic. Turned into a larger
  parity cleanup (all six CLDR plural forms enforced by `keyParity.test.ts`,
  placeholder-set parity between locales, an accidental Arabic word regression on
  `admin.players.credits` — "رصيد" instead of "زيارة" — caught and reverted).
- Arabic month names switched from Levantine (آب, أيلول) to modern/MSA (أغسطس,
  سبتمبر) per live product direction — note this reverses a deliberate BUILD-SPEC
  choice (Levantine names tested for the Jordan audience, see OPEN-ITEMS.md); now
  recorded as intentional.

All changes: typecheck clean, lint clean, full Jest suite 1184/1184 passing, DB
integration suite 542/543 (the 1 non-regression noted above).

## Verified working correctly
- Full player booking flow (cash / CliQ / credit), cancellation, subscriptions
- Sign-in / sign-up / sign-out
- Language switching with a true native RTL relaunch (tab bar mirrors, chevrons
  flip, Western digits preserved per spec)
- Tier-change-history feature, tested end-to-end (changed a player's tier,
  confirmed a history entry appeared)
- Player list (search/filters, tier badges, credit counts, balances)
- Reports screen (coach-only)
- Announcement composer — empty-submission validation correctly blocked
- Per-message RTL/LTR direction detection on the announcements list (mixed
  Arabic/English messages align independently, per BUILD-SPEC 14.11)

## Session 2 (continued testing) — bugs found and fixed

- **`ErrorState` and `EmptyState`'s retry/action button and `WhatsAppButton`
  were never actually centered**, on every screen that uses them (i.e. most
  of the app) — same root cause as the auth-screen footer bug from session 1
  (`Button` defaults `alignSelf: 'flex-start'`, overriding the container's
  `alignItems: 'center'`), just never caught there because those two
  components weren't touched in the first pass. Fixed directly in both
  shared components rather than patching every call site.
- **The pairing-rules row text ("X و Y لا يكونان...") had no space between
  the Arabic "و" and the following name** — `{{a}} و{{b}}` in `ar.json`
  instead of `{{a}} و {{b}}`, visually merging the conjunction into the next
  word. Fixed in both `neverPairRow` and `alwaysPairRow`.
- **`DateField`'s picker button showed day/month/year in the wrong order**
  ("أغسطس 2026 27" instead of "27 أغسطس 2026") — the reported bug that
  started this pass. Root cause was two-layered: (1) forcing
  `textAlign:'left'`/`writingDirection:'ltr'` isn't enough to keep a mixed
  Arabic+digit string in source order inside the app's ambient RTL layout —
  `isolateLTR()` (already used for phone/email, BUILD-SPEC 16.2) is what
  actually fixes that; and (2) even inside that isolate, bidi rule W2
  reclassifies a year immediately following an Arabic month as an *Arabic*
  number (searches backward for the nearest strong character, finds the
  month) and renders it on the wrong side — fixed with an invisible LRM
  right before the day/year-separating space, added as a local
  `forceLtrDate` helper in `DateField.tsx` only.
  **Important scope note:** an early attempt applied the LRM fix inside the
  shared `formatSessionDate`/`formatMonthLabel` (`src/lib/time.ts`) instead,
  which broke spacing in the ~30 other call sites that render dates in the
  app's normal RTL flow (already correct, never touched by W2 the same way
  in that context) — e.g. schedule day headers went from "27 أغسطس 2026" to
  "27 أغسطس2026" with a swallowed space. Reverted; the fix is local to
  `DateField.tsx` only, which is the one place that forces LTR regardless
  of app language.
- **Create Session's server-side conflict error ("Another session already
  starts at this time in this venue") didn't clear when the coach changed
  venue, date, or time without resubmitting** — reproduced directly:
  submitting a conflicting slot showed the error; switching to a different,
  genuinely free venue kept showing the same stale error text even though
  the *next* submit succeeded (confirmed a session was created in Postgres
  while the error was still on screen). Fixed by resetting `submitError`
  whenever venue/date/time change, using React's "adjust state during
  render" pattern (not a `useEffect`, which `react-hooks/set-state-in-effect`
  correctly flags as the wrong tool for this). Applied the identical fix to
  `SessionEditScreen`'s start-time/court-count errors, which have the same
  shape.

All changes: typecheck clean, lint clean, full Jest suite 1184/1184.

## Court board (drag/swap/lock) — verified working correctly
Tap-to-select-then-tap-to-swap between courts, undo, long-press to lock/
unlock a court, swap correctly refused into a locked court with a clear
error toast, "Add rotation" and "Regenerate" both show the expected
destructive-confirmation dialog and correctly preserve locked courts/pairing
rules. Rotation rule cycling (odd → similar-levels, even → mixed) confirmed
intentional by reading `engine.ts`, not a bug.

## Announcement compose → publish — verified working correctly
Full round trip tested: typed a message with quotes/ampersand/percent
(non-ASCII and emoji can't be typed through execbro's native keyboard driver
without a Metro/fiber connection, which wasn't available this session — not
an app limitation), watched the live character counter and preview update,
confirmed the "will reach N devices, cannot be undone" send confirmation,
and confirmed the row appears in the list immediately after with `push_sent_at`
set correctly server-side.

One thing that looked like a bug but wasn't: after publishing, the list
kept showing "Sending…" instead of "Sent" even though the DB's
`push_sent_at` was already set — switching tabs and back didn't update it.
Traced this to `useAnnouncements`' 30s `staleTime`
(`src/features/announcements/queries.ts`) combined with `focusManager` only
being wired to whole-app foreground/background
(`src/lib/queryClient.ts`), not per-screen navigation focus — switching
tabs never refetches a merely-stale query. A full app restart immediately
showed "Sent" correctly, confirming the data and query are right; the
screen also has a working pull-to-refresh wired to the same refetch. Not
treating this as a bug: it self-corrects the next time the coach
backgrounds/foregrounds the app (foregrounding refetches stale queries) or
pulls to refresh, both of which are ordinary usage, not workarounds.

## CliQ upload, booking, and account lifecycle — verified working correctly

- **CliQ payment + screenshot upload**, full round trip as a real player
  (`player001`): booked a session with CliQ selected, granted Photo Library
  access (the system prompt's copy is correct and specific), picked a photo
  through the native picker, saw the attached-image preview with a Replace
  option, confirmed the booking. Verified server-side: `bookings.payment_method
  = 'cliq'`, `payment_status = 'unpaid'` (correctly pending coach review),
  occupancy count updated live, and the screenshot itself landed in the
  private `payment-proofs` storage bucket named by booking ID. My Bookings
  correctly shows the CliQ chip on the booking. One venue in seed data has no
  CliQ alias configured, and the screen correctly shows an explanatory
  message instead of a broken field (same pattern as the unset
  `google_maps_url` case from session 1) — not a bug.
- **Sign-up → email verification → auto sign-in**, tested with a disposable
  account (`deleteme.test@pob.test`) rather than the shared seed players, to
  avoid disturbing seed data other tests depend on. Confirmed via Mailpit
  (local dev's mail catcher) that the verification email is sent with a
  correct confirmation link; visiting it marks `email_confirmed_at` in
  Postgres, and the app's "check your inbox" screen — which polls and
  transitions on its own — correctly detected the confirmation and moved
  straight into the signed-in app without any manual step.
- **Delete account**, tested on that same disposable account (Arabic
  type-to-confirm field filled via the simulator pasteboard, since typing
  non-Latin text isn't supported by execbro's keyboard driver without a
  Metro/fiber connection). The confirmation screen's plain-language
  breakdown of what happens is accurate: verified directly in Postgres that
  the `auth.users` row was fully removed and the `profiles` row was
  anonymized exactly as described ("Deleted" / "player", phone cleared)
  rather than hard-deleted, preserving historical session data as promised.

## Not yet tested
- Grant/adjust subscription flows (beyond the stale-error class of bug
  already fixed and confirmed in `CreateSessionScreen`/`SessionEditScreen`)
