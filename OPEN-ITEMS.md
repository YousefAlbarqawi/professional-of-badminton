# Open items

Things deferred, unfinished, or waiting on a decision, listed by the phase that
raised them. Not a bug tracker: everything here is known, deliberate, and
recorded in BUILD-SPEC.md as well. This file exists so there is one page to open
at the end of the build instead of four.

Each item says what it is, why it is still open, and what closing it costs.

---

## Needs a client decision, closed by picking the better engineering answer

### ~~Where the password reset link should land~~ — closed, phase 10

BUILD-SPEC section 24, question 8, and 23.3's privacy policy host.

14.5 is built exactly as written: an email field, the Supabase reset link is
sent, a confirmation screen follows. But Supabase sends a link that redirects to
`site_url`, and a mobile-only app (D79) has no such page. There was nowhere for
the player to type a new password, so the email dead-ended — and 23.3's privacy
policy, written in phase 10 in both languages, had the same problem: a URL to
host it at that did not exist. Neither store accepts a submission without one,
so this was on the critical path rather than merely convenient.

**Decided: a hosted page, not a deep link.** `docs/` in this repository, meant
for GitHub Pages (`main` branch, `/docs` folder):

- `docs/reset-password/index.html` reads the recovery token from the URL
  fragment and calls Supabase's `auth/v1/user` REST endpoint directly — no
  SDK, no CDN script — to set the new password. Bilingual, matches the app's
  dark theme, mirrors the app's own password rule
  (`src/features/auth/schemas.ts`'s pattern). `docs/reset-password/config.js`
  holds the two public values it needs (`pob-prod`'s URL and anon key — public
  by design, same as every `EXPO_PUBLIC_*` value): until it is filled, the page
  says so plainly instead of failing silently.
- `docs/privacy-policy/index.html` is the same content as
  `store/privacy-policy.en.md` and `.ar.md`, transcribed to bilingual static
  HTML with the same toggle.
- `src/features/auth/api.ts`'s `requestPasswordReset` passes
  `EXPO_PUBLIC_PASSWORD_RESET_URL` as `redirectTo` once it is set
  (`.env.example`, `app.config.ts`, `src/lib/config.ts`). Blank, it behaves
  exactly as it always has.

A deep link (`pob://reset-password` plus a new screen) was the other option
and was rejected: reliably catching a custom scheme from inside a mail app's
in-app browser needs universal links to fall back on, and universal links
themselves need a hosted `.well-known/apple-app-site-association` — the same
hosting requirement, by a longer road, and with a new in-app screen besides.

**Verified, not just written.** Neither page can be exercised by the app's own
test suite — they are outside `src/`, plain HTML and vanilla JS on purpose — so
each was loaded in `jsdom` and driven directly: `reset-password/` against nine
scenarios (unconfigured, no token, an expired-link error, a valid token
showing the form, a weak password and a mismatch both rejected client-side
with no network call, a real submit — captured and confirmed as `PUT
/auth/v1/user` with the exact `apikey` / `Authorization: Bearer` / body shape
Supabase's REST API expects — a server rejection, and the Arabic toggle);
`privacy-policy/` against its own toggle. All nine and both passed. The
`</script>` blocks were also `node --check`ed for plain syntax validity.

**Moved off GitHub Pages to Vercel.** Both pages are now live at
`professional-of-badminton.vercel.app` — same content, same repo, `docs/` set
as the Vercel project's root directory, deployed through Vercel's GitHub App
scoped to just this one repository (not every repo on the account).
GitHub Pages is left running too — nothing about the move required turning it
off — but `EXPO_PUBLIC_PASSWORD_RESET_URL` and Supabase's redirect allow-list
now name Vercel as the primary, with GitHub Pages' URL kept on the allow-list
alongside it.

**Then onto `professionalofbadminton.com`.** The domain was bought, so the
pages moved off the generated `.vercel.app` name and onto the apex — the same
domain the mail already sends from, rather than a second name for the same
product. The apex is canonical and `www` redirects to it, which is the reverse
of Vercel's default recommendation and chosen for the same reason: the URL is
typed into App Store Connect, Play Console and a reset email, and the shorter
one is the one worth having there.

DNS stays at Namecheap on BasicDNS rather than moving to Vercel's nameservers,
and that is the load-bearing part of the decision. The zone already carries
Resend's DKIM key, the `send` and `rsend` return-path records, a `p=none`
DMARC record and Namecheap's `eforward*` MX records; Vercel's nameservers would
serve a zone with none of them, and mail on the domain would stop the moment
the change propagated. An `A` record on `@` sits beside the existing `MX`
records without collision, so the web and the mail are independent.

Repository-side this is documentation rather than code — `.env.example`,
`store/README.md`, `supabase/config.toml`'s allow-list comment and the
`config.test.ts` fixture all named the old GitHub Pages path and now name the
domain. The dashboard steps are in `store/README.md`'s "Wiring the domain".
Both older URLs stay on Supabase's allow-list: `redirectTo` is matched exactly,
so a reset link already sitting in an inbox would otherwise stop working.

**What was a manual step, not code — now split between done and still open:**

1. ~~Push this repository to GitHub and enable Pages~~ — done. Public at
   `github.com/YousefAlbarqawi/professional-of-badminton`, Pages serving
   `main` / `/docs`. Superseded by the Vercel deployment above as the
   primary host, but still live and still on Supabase's redirect allow-list.
2. ~~Fill `docs/reset-password/config.js` with `pob-prod`'s URL and anon
   key~~ — done, with `pob-prod`'s real project URL and publishable key.
   **Caught a real gap closing this item out again:** those values had been
   sitting filled in the local working tree since an earlier pass but were
   never committed, so both hosted pages had been serving the blank
   "not available yet" placeholder the whole time this item said closed.
   Committed and pushed now — verified live on both hosts, in both
   languages.
3. ~~Set `EXPO_PUBLIC_PASSWORD_RESET_URL` on the EAS `production`
   environment~~ — done twice: first against the `.vercel.app` URL, then
   reopened by the domain move and now reading
   `https://professionalofbadminton.com/reset-password/`, verified with
   `env:list`. The value is inlined at build time, so it only reaches players
   in the next production build — harmless until then, since the old URL still
   resolves.
4. ~~Add that same URL to `pob-prod`'s Authentication → URL Configuration →
   Redirect URLs~~ — done. All three are on the allow-list: the apex, the
   `.vercel.app` URL and the GitHub Pages one. The older two stay rather than
   being replaced, because `redirectTo` is matched exactly and links already
   sent point at them.
5. ~~Add `professionalofbadminton.com` to the Vercel project and add the `A`
   and `www` `CNAME` records at Namecheap~~ — done. The apex is connected to
   Production and reads Valid Configuration; `www` is a 308 to it. Namecheap
   carries `A @ 216.198.79.1` and
   `CNAME www d1ff9858ea0847b1.vercel-dns-017.com.`, both resolving at
   `dns1.registrar-servers.com`, with the nameservers and all four mail records
   untouched. Worth knowing for next time: Vercel's add-domain dialog
   pre-checks **"Redirect apex domains to www"**, which silently inverts the
   apex-canonical decision above unless it is unchecked.
6. Enter the `.../privacy-policy/` URL in App Store Connect and Play Console
   (23.3, already tracked in `store/README.md`'s release checklist).
   **Play Console registration is done** — the $25 one-time fee is paid, so
   the Android half is unblocked end to end and only needs the URL typed in.
   Apple Developer Program enrollment has been submitted and is still
   processing, so App Store Connect cannot be reached yet.

---

## Deferred to a later phase, deliberately

### ~~The credits card on the profile screen~~ — closed in phase 6

BUILD-SPEC assumption A30.

Built, along with the subscriptions screen (14.13) it taps through to. The
number on it is the sum of the credit ledger, and the screen behind it lists
the rows that number was summed from.

### ~~Duplicate on the admin schedule~~ — closed

BUILD-SPEC 15.3 lists three row actions: _Edit this date_, _Cancel this
session_, _Duplicate_. Built: a ghost button under each row calls
`navigate('CreateSession', { venueId, startTime, durationMinutes, priceJD,
courtCount })`, leaving `sessionDate` out entirely so `CreateSessionScreen`'s
own `??` fallback defaults it to today rather than carrying yesterday's date
forward. Tap-to-edit is unchanged; this is a second, separate affordance
rather than a menu in front of it, so no existing test's navigation assertion
had to move. `AdminScheduleScreen.test.tsx` covers the prefill mapping.

### ~~One of section 8.6's five cron jobs~~ — closed in phase 6

BUILD-SPEC 8.6 and the notes in `supabase/migrations/0019_cron_jobs.sql` and
`0028_session_lock_and_purge.sql`.

Phase 3 scheduled the 5 minute session status advance and the nightly
`generate_sessions(21)`. Phase 5 scheduled the daily 03:10 lock. Phase 6
scheduled the daily 03:20 subscription expiry, in migration 0030.

Four of the five are now in `pg_cron`. The fifth, the daily 04:00 payment proof
purge, cannot be a cron job at all — see the next item.

### ~~The proof purge needs a daily invocation~~ — closed, deployment

BUILD-SPEC 8.6's fifth job, A13 and A54.

Storage refuses a SQL delete of an object — `storage.protect_delete` raises on
any DELETE against `storage.objects` that does not come through the Storage
API — so the purge cannot live in `pg_cron`. It is split the way
`delete-account` already splits the same problem: `purge_payment_proofs()`
retires the rows and returns the paths, and the edge function
`purge-payment-proofs` hands those paths to the Storage API. Both are built and
the SQL half is tested.

**Closed.** The `purge-payment-proofs` edge function is deployed to
`pob-prod` and active. The schedule itself is `pg_cron` plus `pg_net` plus the
service role key in `supabase_vault`, exactly as this item proposed — a daily
04:00 Amman (01:00 UTC) job named `purge-payment-proofs`, calling the function
with the key read out of vault at call time rather than embedded in the job
definition. **Verified, not just scheduled:** the function was invoked by
hand outside the schedule and returned a real `200` with
`{"ok":true,"retired":0,"removed":0,"failed":0}` — an authenticated call
reaching the function and running the RPC underneath, not just a queued
request.

### ~~The announcement composer behind the cancellation prompt~~ — closed in phase 8

BUILD-SPEC 9.4 step 6 and A6.

Built. `AnnouncementComposeScreen` reads `route.params.draftBody` and opens with
the prefilled body, and `AnnouncementComposeScreen.test.tsx` asserts that path
specifically. Cancelling still sends no push (D31); the announcement the coach
chooses to post afterwards is the thing that does.

### ~~The payment summary and the court board button on Today~~ — closed, phase 10

BUILD-SPEC 15.1 asks each Today card for "venue, time, occupancy, status chip,
and a payment summary once the session is past", plus "a secondary _Court board_
button [that] appears within 2 hours of start".

The first four are built, the card's primary tap reaches Session manage (15.2),
and phase 7 added the court board button: it appears from two hours before the
start until the session ends, and it lands on 15.2's court board tab rather than
on the roster (`showsCourtBoard` in `sessionStatus.ts`).

**Closed.** `get_sessions_money_summary` (migration 0039) is the one-query
shape this item was waiting on: `get_session_money_summary` (A53) already had
the arithmetic, gated on `is_staff()` for the same reason (D16, an admin reads
it too), but it answers for one session at a time and a list of today's
sessions wants them all at once. 0039 batches the same 12.2 valuation — cash
and CliQ actually collected, plus a credit at its subscription's snapshotted
rate, against what was expected — over whatever `session_id`s the client
hands in, with a session missing from the result never happening: it comes
back as zeroes rather than being dropped, since the caller already knows which
sessions it asked about.

`TodayScreen.tsx` fires the batch once, for every card already past its end
time (`isSessionPast` in `sessionStatus.ts`), and renders the two figures
under a qualifying card once the batch resolves. It is decoration on a list
that is useful without it — the same treatment the player schedule already
gives the booked chip — so a card renders with or without the summary rather
than the whole screen waiting on a second query.

### ~~Two row actions on 15.2's players tab~~ — both closed

BUILD-SPEC 15.2 lists three row actions on the players tab: _Remove_, _Change
tier_, _Move to another session_. Remove is built, with the credit return prompt
from 8.3 and D26.

- **Change tier** is closed. `ChangeTierSheet` opens from the row menu, one
  tap and written — the same `TierPickerRow` and the same
  `useSetPlayerTier` mutation 15.8 section 2 uses, so the two "lands with
  15.8" pieces closed together rather than one shortcutting the other.

- **Move to another session** is built, phase 10 — `admin_move_booking`,
  migration 0037, D81, `RowActionsSheet` and `MoveBookingSheet`. The row tap
  now opens a small menu rather than jumping straight to Remove, since there
  are two destinations. Its three open questions are answered and recorded in
  the decisions register as D81 rather than here:

  - **Does the price re-resolve?** No. `expected_fils` and `paid_fils` move
    across unchanged — the check constraint `paid_fils <= expected_fils` is
    part of why: recomputing the target's price independently of what was
    already collected can violate it the moment the two sessions' prices
    differ. If the coach wants the new session's price applied, the Money tab
    is where he already corrects any other booking.
  - **Does a credit follow him?** Yes, literally — the new booking reuses the
    same `credit_txn_id`, so nothing is refunded and nothing is spent twice.
    Removing the moved booking later still refunds correctly, because
    `admin_remove_booking` finds that same transaction.
  - **Does target capacity apply?** Yes, unconditionally (D30). The target
    goes through `assert_session_addable`, the same lock-and-count gate a
    fresh booking passes through.

  Scoped to `attendee_kind = 'player'`: a guest is never remembered (D46) and
  a coach's booking is tied to the night's fee split (D76), neither of which
  a plain move carries. `supabase/tests/moveBooking.test.ts` covers the
  refusals and the money/credit continuity, and — unlike the first pass, which
  had no Docker to check it against — has now actually run against a local
  Supabase stack (`supabase db reset` then the suite, all 11 cases and the
  532 around it green). It caught one real bug on the way: the fixture picked
  `seededPlayer(48)` and `(49)`, past the 40 players section 22 actually
  seeds, so every case failed on sign-in before any RPC logic ran. Fixed to
  players 39 and 40. **Verified done, not just typechecked.**

### ~~The CliQ payment path~~ — closed in phase 5

Built. The option is no longer disabled, the alias carries a copy button, the
screenshot is resized to 1600px and compressed to JPEG 0.7 before upload, and
the booking and its proof are written in one transaction by
`create_cliq_booking` (A45), with a deferred constraint trigger enforcing 10.1's
rule underneath (A46).

One half stayed open and became a conflict rather than a deferral: 14.10's
screenshot thumbnail on the player's booking detail screen. 7.3 gives only staff
`SELECT` on the bucket, so the player cannot read back the file he uploaded. The
card now says the screenshot was sent to the coach. See C5 in BUILD-SPEC.md for
what overturning that would cost.

**The alias is now answered** — section 24, question 2: `prof2023`, held by
`MOHAMMAD YOUSEF A. ABUDABBOUR`. Both are hardcoded fallbacks in
`src/lib/config.ts` (the same treatment as D71's WhatsApp number, so a build
whose EAS environment is missing the variable still shows the right alias
rather than none), overridable by `EXPO_PUBLIC_CLIQ_ALIAS` and
`EXPO_PUBLIC_CLIQ_ACCOUNT_NAME` without a new binary. The sheet shows the
account holder under the alias: the academy's CliQ account is a personal one,
so the name a player's banking app puts in front of him at the moment of
transfer is not the academy's, and seeing it in the app first is what makes
that reassuring rather than a reason to stop and message the coach. The
"ask the coach on WhatsApp" fallback and its `payment.aliasUnavailable` string
are gone with it.

### ~~The court board tab on session manage~~ — closed in phase 7

BUILD-SPEC 15.2 gives session manage three tabs. Players was built in phase 4,
money in phase 5, and the court board is now 13.10 in
`SessionCourtBoardTab.tsx`: rotation chips, court cards, the Resting section,
drag and tap-to-swap, court locking, pairing rules, and 13.8's staleness banner
with its confirming Regenerate button.

### ~~`notify_waitlist` marks who should be told; nobody is told yet~~ — closed in phase 8

BUILD-SPEC 8.4 and assumption A39.

Built. Migration 0035 rewrites `notify_waitlist` so that step 4 lands: it
enqueues one `push_jobs` row carrying the players it stamped, the venue in both
languages and the start time, and `send-push` drains it. D28 is unchanged and
is now asserted one step further along — at 40 minutes no job exists at all, so
there is nothing for a drain to find (`supabase/tests/pushOutbox.test.ts`).

### ~~One of 15.8's eight sections on the admin player profile~~ — closed, phase 10

BUILD-SPEC 15.8 and assumptions A57 and A60.

Phase 5 built sections 1 (identity) and 6 (balance). Phase 6 added section 5
(subscriptions: grant, extend, adjust credits) and 15.7's player list, which
gives the screen its second way in — and, per A60, the only route to 15.9 and
15.10 that the specification describes.

**Closed since:** sections 2 (tier), 3 (visibility) and 4 (custom rate) and 8
(role) — four writes to guarded profile columns, none through an RPC:
`profiles_update_staff` (migration 0012) already grants staff `UPDATE` on this
row, and `trg_guard_profile` (0009) is what actually decides who may touch
these five columns and who may promote to coach, so RLS and its trigger are
the boundary rather than a function, per CLAUDE.md. Every one of the four also
fires `trg_audit_profiles` (0011).

- **2, tier** — `TierPickerRow`, shared with 15.2's _Change tier_ row action
  (closed above), one tap and written. The "change history" half of this
  item's original wording was not built in this pass — see below for when it
  was.
- **3, visibility level** — a `SegmentedControl` over D14's three levels,
  reusing 15.7's own labels (`admin.players.visibility0/1/2`).
- **4, custom rate** — two `NumericInput` fields and a Save button, local
  state rather than a form library, the same shape `BalanceEntrySheet` uses
  for its two fields. Blank saves `null` (the session's list price); D41's
  zero is never confused with blank. One _Reset to default_ button clears and
  saves both fields at once rather than one per field.
- **8, role** — coach only, gated on the viewer the same way _Extend_ already
  gates on D55: an admin viewing this screen is never even offered the
  toggle, since `trg_guard_profile`'s `only_coach_can_create_coach` branch
  would refuse him regardless (D16). Promoting and demoting both confirm
  first (17.4). Only the player ⇄ coach transition is exposed; nothing here
  touches `admin` or `assistant_coach`, which OPEN-ITEMS' and BUILD-SPEC's own
  wording for this section never asked for either.

**Closed since — 7, recent sessions:** the last 20 bookings with payment
outcomes. Unlike the other four this was a query and a list, not a write to a
guarded column, and it waited for a genuinely different shape of work.
`fetchPlayerRecentSessions` (`src/features/payments/api.ts`) is a plain
select against `bookings`, filtered to `confirmed`/`settled` and the caller's
`player_id`, ordered newest first and capped at 20 — the same RLS-is-the-
boundary shape section 6 already uses for `balance_entries`
(`bookings_staff_all`, migration 0012), so there was nothing here for a new
RPC to enforce. Neither `PaymentRow` nor `ReportSessionRow` quite fit — one
carries review actions this list has no business offering, the other is
keyed by session rather than by player — so the row is drawn inline in
`PlayerProfileScreen.tsx`, the same way section 6's balance entries already
are: venue and date on one side, paid-of-expected with the payment method and
status chips on the other.

**Closed since — 2, tier's change history:** the reader `audit_log` was
always waiting on. `fetchPlayerTierHistory`
(`src/features/payments/api.ts`) selects the player's `audit_log` rows
directly, the same plain-select shape as the recent-sessions read just above,
capped and filtered client-side to the rows where `tier` itself moved —
`trg_audit_profiles` (0011) fires on role, visibility, tier and rate writes
alike and writes one row per `UPDATE` covering whichever changed, and there
is no PostgREST filter that compares two `jsonb` columns against each other,
so narrowing to tier-only changes happens after the fetch rather than in it.

`audit_log` is coach-only by RLS (`audit_log_select_coach`, 7.3, D73's "an
admin can do everything the coach can do except see the books"), so the
section is gated on `isCoach` the same way `PlayerProfileScreen.tsx` already
gates _Extend_ and section 8's role toggle — an admin viewing this same
screen never issues the request and never sees the section, rather than
issuing it and being shown nothing. Each row reads "Changed from B to B+"
plus who and when, in the same sentence form `admin.balance.preview` already
uses for a before/after pair, rather than an arrow glyph that would not flip
correctly in Arabic. `TierChangeRow` (`src/components/domain/`) is the row;
`PlayerProfileScreen.test.tsx`'s "change history" block covers the coach/admin
split, the empty state and the error/retry state.

### ~~Pinch to zoom on the payment proof~~ — closed

BUILD-SPEC 10.2: "_View proof_. CliQ rows only. Opens the screenshot full
screen, pinch to zoom."

Built: a real `Gesture.Pinch()`, the same `useSharedValue`/`useAnimatedStyle`
shape `CourtTile.tsx` uses for its pan, clamped 1x–4x. It lives in its own
`ZoomableProofImage` component, keyed by `storagePath` in `ProofViewer.tsx`,
rather than living directly in the viewer and resetting through a `useEffect`
— a shared value cannot be reset from an effect without React Compiler's
immutability lint tripping, and mounting a fresh instance per screenshot gives
fresh scale state for free instead. The tap-to-fill toggle is unchanged.

### ~~The Arabic photo and camera permission strings~~ — closed in phase 10

BUILD-SPEC assumption A80.

`assets/locales/ar.json` and `assets/locales/en.json`, reached through the
config's `locales` field, which writes an `InfoPlist.strings` per language.
`CFBundleAllowMixedLocalizations` went with them, because iOS picks a
permission string by device language rather than by app language.

The same pass removed `android.permission.RECORD_AUDIO`, which
`expo-image-picker` adds by default and which this app has no use for.

---

## Verification debt

### No screen has been viewed on a device — partly closed, twice

Section 19.3, item 5: "The screen has been viewed in Arabic and in English."

**Read this heading with two later entries.** The device verification pass
below took a first cut at it, and the client review pass at the end of this
file took a second — see "What the iOS Simulator actually showed, and what it
did not" for exactly which screens have now been seen and which have not. The
list of screens further down this entry has not been pruned to match, because
almost all of it is still accurate and pruning it would make the debt look
smaller than it is. What follows is still the shape of the problem.

Every phase 2 screen has a test that renders it in both languages and asserts on
the Arabic copy, and the app bundles cleanly for iOS. That proves the strings
resolve and the tree builds. It does **not** prove that RTL mirroring, the Cairo
font, the tab bar and the modal actually look right on a phone.

Section 20 already schedules a full Arabic review in phase 10, so this is not
lost — but 19.3 asks for it per task, and every phase from 2 onwards has
shipped without it.

**Screens awaiting a look:** Welcome, SignUp, VerifyEmail, SignIn,
ForgotPassword, Profile, DeleteAccount, and the player and admin tab bars —
phase 3's Schedule, SessionDetail, Today, AdminSchedule, SessionEdit and
CreateSession — phase 4's booking sheet, My Bookings, booking detail, session
manage and the three add sheets — phase 5's CliQ step, the money tab, the
partial and change-method sheets, the proof viewer and the player profile —
phase 6's Subscriptions, PlayerList, GrantSubscription, AdjustCredits and the
extend sheet — phase 8's announcement list, detail and composer, on both sides
of the app — and now phase 9's Reports, all nine sections of it.

Phase 4 adds a specific thing worth eyes: the bottom sheet is the first modal
in the app that slides from the bottom and holds a scrolling body, and in
Arabic its contents mirror while the sheet itself does not. The keyboard over a
sheet on a small phone is the other one — the add-guest form has a text field
and a numeric field inside it.

Phase 5 adds two of its own. The proof viewer is the only full-screen modal in
the app and the only place an image is rendered at all, and its zoom behaves
differently on the two platforms by design. The CliQ step puts a thumbnail and
a copy button inside an already-scrolling sheet, in a language that mirrors,
above a keyboard on the partial-payment sheet.

Phase 8 adds the one screen in the app whose direction is not the app's. 14.11
renders each announcement in the direction of its own text, so an Arabic list
containing an English notice mixes both on one screen — asserted in
`AnnouncementsScreen.test.tsx`, and never looked at. The composer's preview is
the same component, which means the coach sees the mismatch before he sends it;
that is the part worth a phone.

Phase 9 adds a screen that is almost entirely numbers, which is where mirroring
is hardest to get right and easiest to leave wrong. Two things want a phone
rather than a test: the weekly revenue bars, which grow from the reading start
edge and must not grow from the wrong one in Arabic; and the three money
figures on each session row, which are the densest line in the app after the
court board and are read as a column that is not drawn.

**Closing it:** a dev build on one iOS and one Android device, in both
languages. Phase 5 added three native dependencies — `expo-image-picker`,
`expo-image-manipulator` and `expo-clipboard` (A55) — so a new dev build is
required before any of this can be looked at, which makes now the moment. It has grown rather than shrunk, and phase 3 added a native
dependency (`@shopify/flash-list`, A36) that needs a new dev build anyway, so
the two are worth doing together before phase 4 layers booking on top.

Three things in phase 3 specifically want eyes rather than a test:

- the sticky day headers on the schedule, in Arabic, where the header sits over
  scrolling content and the direction flips;
- the FlashList on the admin schedule, which is the first use of that library
  in this app and the first list long enough to scroll properly;
- the chevron on `SessionCard`, which is a character rather than an icon and
  flips by hand for RTL (16.2).

---

## Recorded elsewhere, not repeated here

- **Conflicts found in the specification** — BUILD-SPEC, `## CONFLICTS FOUND`.
  C4 in particular records why email confirmation gates sign-in rather than only
  booking, and C5 why a player cannot see the CliQ screenshot he uploaded. Both
  say what overturning them would cost.
- **Decisions taken where the specification was silent** — BUILD-SPEC section
  21, assumptions A1 to A71.
- **Questions for the client** — BUILD-SPEC section 24. All but question 8 have
  a working default and block nothing.

---

## Raised in phase 6

### ~~The Amman date on 15.9's grant form is typed, not picked~~ — closed, phase 10

BUILD-SPEC A35, which phase 3 recorded for the same reason on 15.6.

15.9 asks for a start date and an editable expiry. Both were typed
`yyyy-MM-dd`, validated by the form schema, because every date picker for React
Native is a native dependency and section 2.1's stack table listed none. The
expiry auto-fills from the package, so the common case was no typing at all: the
coach picks the 40 visit package and reads "40 credits, expires 20 November
2026" without touching either field.

**Closed.** The client approved the section 2.1 amendment A35 always said this
needed rather than a developer's own call — `@react-native-community/
datetimepicker` is now listed in 2.1, the same way `expo-haptics` was added in
this phase. `DateField`/`FormDateField` (`src/components/primitives/`) wrap it
once: Android mounts the system dialog on press and it closes itself on a pick
or a cancel; iOS has no such dialog, so the same picker in spinner mode is
drawn inline under the field, committing on every tick, with a _Done_ button
that only closes the wheel. All three screens this item named now use it —
15.6's create form, this one's start and expiry, and the extend sheet, whose
minimum-date now matches its own schema rule (later than the current expiry)
so the wheel cannot even offer an invalid date. `dayKeyToCalendarDate`
(`src/lib/time.ts`) is deliberately not `ammanDayStart`: the wheel reads a
`Date`'s local fields, and an Amman-anchored instant would show the wrong day
on a phone in a different zone.

### ~~The player directory is unpaged~~ — closed

BUILD-SPEC 15.7 and A60.

`search_players` returns at most 500 rows and the screen asks for 100. Section
1.4 puts the academy at "roughly 100 to 300 registered players in year one", so
one page held the whole list at the time this was raised, and closing it early
cost nothing the item itself was not already offering as the design.

**Closed, exactly as this item specified.** Migration 0041 adds a cursor on
`(sort key, id)` — `p_after_tier` / `p_after_owed` / `p_after_name` /
`p_after_id`, one of which the live `p_sort` actually reads — to
`search_players`, DESC NULLS LAST included for the tier sort (verified across
the non-null-to-null boundary against a local stack, not just read). The client
side is `usePlayerDirectory` (`src/features/players/queries.ts`), now a
`useInfiniteQuery` instead of a `useQuery`, walking pages of `PLAYER_PAGE_SIZE`
(40) forward from `PlayerListScreen`'s `onEndReached`, with a footer skeleton
while the next page loads and no interference with pull-to-refresh. Changing a
filter or the sort still starts over from page one, since the query key already
carried the filters and `useInfiniteQuery` resets its pages the same way
`useQuery` reset its one page.

### ~~`search_players` sums the ledger per row~~ — closed

Each directory row ran `subscription_remaining` once per live subscription
that player held, inside a correlated subquery. At 300 players that is a few
hundred small aggregates over a table with an index on `subscription_id`, which
was nothing on section 1.4's scale — recorded because it is the one place in
the app where "the balance is always the sum of the ledger" (6.2, D56) cost
something measurable, and because the tempting fix — a counter column — is the
one thing D56 forbids.

**Closed, by the move this item itself named.** `player_credit_balances`
(migration 0041) is a materialised view over exactly the same `SUM(delta)` the
ledger has always been the source of truth for — it writes nothing when a
credit moves, so it is not the counter column D56 forbids, only a nightly
snapshot of the same sum. It refreshes inside `void_expired_subscriptions`,
the same 03:20 job this item pointed at, and is granted to nobody but that
function and `search_players` itself: verified directly against a local
stack that an authenticated player gets `permission denied for materialized
view`, since a materialised view carries no RLS of its own and the grant is
the only boundary it has. **The one thing worth a coach knowing:** a player's
credits and next-expiry date on this screen can now be up to a day stale —
grant one at 9am, and the directory row will not move until the next 00:20
Amman refresh. Nothing else on the row is affected (tier, visibility and
amount owed are still read live), and nowhere else in the app — the player's
own balance, the profile screen's section 6, `pick_subscription` — reads the
cache; all of them still read the ledger directly.

### Table privileges had to be granted explicitly — found in phase 6, fixed in phase 6

BUILD-SPEC section 7, and migration `0032_table_privileges.sql`.

Not deferred — recorded because it is a change to phase 1's surface made from
phase 6, and because anybody reading the migrations should know why 0032 sits
where it does.

Phases 1 to 5 enabled RLS on every table and granted nothing, relying on the
platform's default privileges to give `anon`, `authenticated` and
`service_role` their table access. That is the Supabase convention and it held
on the Postgres image in use at the time. It does not hold on
`supabase/postgres:17.6.1.159`, where the default ACL for objects created by
`postgres` in `public` carries TRUNCATE, REFERENCES and TRIGGER and nothing
else. The symptom is total: every table answers "permission denied", whatever
the policies say, and the whole integration suite fails on setup.

0032 grants `SELECT, INSERT, UPDATE, DELETE` on the public schema to all three
roles and sets the matching default privileges so later migrations inherit
them. It changes no policy and widens no row access — `anon` is granted exactly
what stock Supabase grants it, and section 7's default deny is still the only
thing that decides which rows come back. `anonymous.test.ts` was the check that
caught the first draft, which granted `anon` nothing: that suite deliberately
asserts _empty set_ for tables and _error_ for views, and the difference is the
point.

**Nothing to close.** Worth knowing if a future migration adds a table in a
schema other than `public`, which the default privileges do not cover.

### Two phase-3 artefacts fixed from phase 6 — closed

Both were found by the integration suite once 0032 made it runnable again, and
both are recorded here because they are edits to earlier phases' work.

**`seed.sql` used `current_date`.** A31 replaced it with `amman_today()` in
`generate_sessions` and in the `session_instances` select policy, and said
nothing about the seed. The seed generated its forward window from
`current_date`, which is UTC, so between 00:00 and 03:00 Amman it seeded one
day less than generation would — and `generateSessions.test.ts` asserts that
running generation over a seeded window creates nothing. Thirty occurrences,
all replaced, with the reason recorded at the top of the block.

**`sessionAdmin.test.ts` moved a session to 19:00.** Every Khalda template
starts at 18:30, 19:00 or 20:30 (3.1), and `SESSIONS.open` is on today + 1, so
on any day whose tomorrow is a Saturday or a Thursday the edit collided with a
seeded session and raised `session_time_taken`. The test did not check the
error, read back an unchanged price, and reported it as a failure of A7's price
rule. It now moves the session to 16:15 and asserts the RPC succeeded.

---

## Raised in phase 7

### ~~Haptic feedback on a court board swap~~ — closed, phase 10

BUILD-SPEC 17.4: "Haptic feedback on booking success and on court board
swaps."

Neither was built through phase 9. Phase 4 left the booking half to "the
device pass in phase 10"; phase 7 hit the same wall from the other side and
found a harder reason than timing: haptics need `expo-haptics`, which was not
in section 2.1's stack table, and CLAUDE.md's non-negotiables say not to add a
library that table does not list. Section 2.1 said of itself "Fixed. Do not
substitute" — two rules pointing opposite ways, and closing it needed "a
sentence from the client adding it to 2.1, not a decision from the developer."

That sentence came in phase 10: 2.1 now lists `expo-haptics`. Built —
`src/lib/haptics.ts` wraps the two calls, `BookingConfirmSheet`'s success
handler fires one and `SessionCourtBoardTab`'s swap handler fires the other.
The toast on every swap and the booking sheet's success state stay exactly as
they were; the haptic is additive, not a replacement.

Verified as far as this environment can: `npm run typecheck`, `npm run lint`
and the unit suite are clean, and `expo-haptics` is a real, installed
dependency (`package.json`, `package-lock.json`), not just an import that
happens to resolve. What is not verified — cannot be, without a phone — is
that it is felt. That question belongs to the same device pass everything
else in _Verification debt_ is waiting on.

### ~~A seventh rotation cannot be added from the board~~ — closed

D62 and assumption A15: a 2.5 hour session runs six rotations "and a seventh
rotation, if played, uses rule 1", and A15 says the coach adds it by hand from
the court board.

Built: an _Add a rotation_ button next to Regenerate, shown up to
`session_instances`' own ten-rotation ceiling. It calls the new `add_rotation`
RPC (migration 0038), which raises `rotation_count` by one and hands back the
new value — nothing about the lineup itself — and the client then rebuilds the
board for that count exactly as Regenerate does, behind the same confirmation,
since it is the same destructive rebuild one rotation longer.
`ruleForRotation(7)` already returned rule 1 before this, so the engine did not
change.

### The court board has not been read at arm's length — phase 7 → phase 10

13.10 sizes this screen for a coach reading it aloud across a gym: names at
18pt minimum, no truncation, court 1 leftmost in both languages.

All three are asserted in `SessionCourtBoardTab.test.tsx` — the font sizes, the
absence of `numberOfLines`, and the row direction — and none of them has been
looked at on a phone in a room with gym lighting, because nothing in this
project has yet (see _Verification debt_, above). The drag gesture in
particular has never run: a pan handler cannot be driven through the renderer,
so what is tested is its hit test as a pure function.

**Closing it:** the same device pass everything else is waiting for. The drag
is the part to try first, because it is the part with no test behind it.

---

## Raised in phase 8

### ~~Push cannot reach a real device until three deployment values exist~~ — Android closed, iOS open — phase 8 → deployment

BUILD-SPEC section 18, 2.1 and 23.2, and assumption A69.

Everything in the path is built and exercised: tokens register, the outbox
enqueues, `send-push` runs under Deno, reaches the Expo API, records tickets and
prunes what Expo says is dead. It was run against the real Expo push service
from the local stack, and three fake tokens came back `DeviceNotRegistered` and
were deleted, which is section 18's pruning rule proven on the ticket branch.

**What was missing was credentials, not code.** All three named here are now
either done or precisely scoped to what's left:

- ~~`EXPO_PUBLIC_EAS_PROJECT_ID`~~ — done. The EAS project did not exist at
  all until this pass (see "The EAS project did not exist" below); it does
  now, and the variable is set on `production` pointing at it.
- **APNs key and FCM credentials, plus `google-services.json`.** FCM is
  done: a Firebase project was created (`professional-of-badminton`, no
  Google Analytics — not needed for push), an Android app registered inside
  it under `jo.professionalofbadminton.app`, `google-services.json`
  downloaded and wired into `app.config.ts`'s `android.googleServicesFile`,
  and the Firebase Admin SDK's FCM V1 service account key generated and
  uploaded to EAS credentials for that same application identifier — the
  local copy of the key was deleted immediately after upload; it lives only
  on EAS now. **APNs is still open**, blocked on Apple Developer Program
  enrollment finishing processing (order placed, pending).
- **A build on each platform.** Android is done — see "First successful
  production Android build" below; a signed `.aab` exists. iOS is blocked
  on the same Apple Developer Program enrollment as the APNs key above.

**Until Apple's enrollment clears, the phase's stated done-when — "a real
device on each platform receives both notification types and lands on the
right screen" — has not been fully demonstrated.** Android's half of it is
now unblocked and just needs a phone; iOS needs the enrollment first.

**Closing what's left:** once Apple Developer Program enrollment completes,
generate the APNs key the same way the FCM key was generated, upload it to
EAS credentials, build iOS, and send one announcement and one waitlist spot
to a phone of each kind.

### The EAS project did not exist — found in deployment, closed in deployment

Not something BUILD-SPEC or an earlier phase called out, because there was no
reason to suspect it: `eas.json` and the push/build items above all assumed a
project already existed somewhere. It didn't. The account (`yousefalkhatib2`)
had zero EAS projects before this pass.

**Closed.** Created via the Expo dashboard — slug `professional-of-badminton`,
personal account (Expo recommends an organization instead for new projects;
not changed, since restructuring the account is a bigger decision than this
item asked for) — and linked into `app.config.ts` via `extra.eas.projectId`.
This is what every env var and credential item elsewhere on this page that
mentions "EAS production" was actually being set on.

### First successful production Android build — closed in deployment

Three real, unrelated build failures had to be found and fixed before
`eas build --platform android --profile production` produced a working
`.aab`, each worth recording since none of them are visible from reading the
source — only from watching the build fail:

- **`eas.json`'s `cli.appVersionSource: "local"` doesn't work with
  `app.config.ts`.** EAS can only auto-write an incremented build number back
  into a static `app.json`, not a `.ts` file it would have to execute, so
  every build failed at "autoIncrement option is not supported when using
  app.config.js." Changed to `"remote"`, which tracks the Android version
  code and iOS build number on EAS's own servers instead of in local config —
  the standard fix for exactly this combination, and a clean switch here
  since neither `ios.buildNumber` nor `android.versionCode` was set locally
  to begin with.
- **The committed `package-lock.json` failed `npm ci` on EAS's build image,
  but not locally.** The error named a missing `@emnapi/core@1.11.3` /
  `@emnapi/runtime@1.11.3` — a transitive dev dependency pulled in by
  `eslint-config-expo`'s resolver tooling. Root cause: EAS's build image runs
  Node 22.23.1 / npm 10.9.8, and the lockfile had been generated with a newer
  local npm (11.6.2) that resolves that dependency differently. Installing
  Node 22.23.1 locally via `nvm` reproduced the exact failure, and
  regenerating `package-lock.json` with that same npm version fixed it —
  verified both ways afterward, npm 10.9.8 and npm 11.6.2 each install clean
  against the regenerated lockfile.
- **Android Lint's `ExtraTranslation` check failed the release build.**
  `assets/locales/en.json` and `.ar.json` exist for iOS's `InfoPlist.strings`
  mechanism only (23.3, A80) — `NSPhotoLibraryUsageDescription` and
  `NSCameraUsageDescription` are iOS permission-string keys with no Android
  meaning at all — but Expo's `locales` config field mirrors those same keys
  into Android's per-locale `strings.xml` regardless, where they have no
  default-locale counterpart and trip the lint rule. A local config plugin,
  `withDisableExtraTranslationLint` in `app.config.ts`, disables just that
  one lint check via a `lint { disable 'ExtraTranslation' }` block injected
  into the generated `android/app/build.gradle` — verified by running
  `expo prebuild` locally and confirming the block lands correctly, since
  Android Lint itself needs an Android SDK this environment does not have.
- **Sentry's Gradle plugin failed the build outright without a configured
  Sentry project**, not merely warned as `store/README.md`'s Sentry section
  assumed: `sentry-cli` exited non-zero trying to upload a source map with no
  organization to upload it to. `SENTRY_DISABLE_AUTO_UPLOAD=true`, set on EAS
  production, is Sentry's own documented escape hatch for exactly this case —
  `node_modules/@sentry/react-native/sentry.gradle` gates the whole upload
  task on that variable. Crash reporting itself is unaffected; only the
  source-map upload is skipped, and only until `SENTRY_ORG` / `SENTRY_PROJECT`
  / `SENTRY_AUTH_TOKEN` exist and this flag is removed.

### ~~The outbox has no scheduled drain~~ — closed, deployment

BUILD-SPEC 8.4 step 4, and the same shape as the proof purge item above (A54).

`send-push` is nudged from the app the moment something is enqueued: the
composer after publishing, and the cancellation and admin-removal mutations
after `notify_waitlist`. That covers every trigger in practice, and it is what
makes a waitlist push arrive in seconds rather than minutes — D27 makes the
list a race.

Two things still wanted a periodic drain. A nudge that fails — the phone lost
signal between the cancellation and the invoke — leaves a job sitting until
something else pushes. And Expo's receipts are fetched at the _start_ of the
next invocation, by design, so on a quiet week the previous send's dead tokens
are not pruned until the next announcement.

**Closed.** A `pg_cron` job named `drain-push-outbox` calls `send-push` every
15 minutes, wired alongside the proof purge job and sharing the same
`supabase_vault` secret. **Verified**: invoked by hand outside the schedule
and returned a real `200` with `{"ok":true,"jobs":0,"sent":0,"pruned":0}` —
zero jobs is correct for a freshly seeded prod database with no push activity
yet, not a sign the call failed.

### ~~`NotYetBuiltScreen` now has no caller~~ — closed in phase 9

Every route it stood in for has a screen. Phase 9 built the last one — 15.12's
Reports, in the More stack — so the placeholder was deleted along with its
`notYetBuilt` strings in both decks. Section 4 does not allow a stub to sit in
the tree once nothing points at it.

### ~~A player who never joins a waiting list hears nothing at all~~ — decided, phase 10

BUILD-SPEC section 18 and assumption A69.

Section 18 says permission is requested "the first time the player joins a
waiting list, not on first launch", and that is what is built. The consequence
follows from it rather than from any choice made here: no permission means no
push token, and no push token means announcements do not reach him either.

So the coach's announcements reach only the players who have joined a waiting
list at some point. That may be exactly what the client wants — it is certainly
what the specification says — but it is worth him knowing, because "publishing
sends a push to every registered device" (15.11) is true and quieter than it
sounds.

**Decided: leave section 18 exactly as written, add no second touchpoint.**
Unlike the hosting decision and the money rules in D81, this is not an
engineering trade-off with a better and a worse answer — section 18 is
deliberate and specific about exactly one moment to ask, and the fix on offer
is a second permission prompt the specification does not call for. Adding one
on the developer's own initiative would be scope the client never asked for,
in the one part of the app (notification permission requests) where asking too
often has a real cost: an OS-level permission a player says no to twice tends
to stay no. The honest closing move for this item was always "tell the client,
let him decide" rather than "write the code" — and telling him is what this
paragraph is for. If he wants the extra touchpoint, it is still what it always
was: a sentence from him and about ten lines of code, on the announcements
tab's first visit, in the same plain wording section 18 already uses.

## Raised in phase 9

### ~~The reports screen fires eight queries for one month~~ — closed

BUILD-SPEC 15.12 and `src/features/reports/queries.ts`.

Nine sections come from eight functions, and the screen runs the totals query
first and the other seven only once it has succeeded. That is deliberate: an
admin must generate one refusal rather than eight (D73), and the coach pays one
extra round trip on the first month he opens rather than the seven he would pay
if they were chained.

Two rounds of requests for one screen is more than any other screen in the app
makes. At section 1.4's scale — twelve sessions a week, one coach reading a
month at a time — it is comfortably fast against the local stack, and every
query caches for five minutes on a closed month, so this was never urgent. It
is closed anyway, ahead of ever feeling slow, per the direct request that
raised it.

**Closed.** `report_sections` (migration 0040) is the fold this item itself
proposed: one function that calls the other seven and hands back a `jsonb`
document, so opening a month the coach has not looked at yet now costs at most
two requests — the D73 gate, then everything past it — instead of up to eight.
`report_totals` is untouched and still runs alone, since folding it in as well
would mean an admin generating two refusals instead of one. The seven wrapped
functions are untouched and still independently callable; nothing was deleted,
only composed. `src/features/reports/api.ts`'s `fetchReportSections` is the one
place the "eight typed row shapes for one untyped blob" trade actually happens
— it parses the bundle back into the same seven typed shapes the panels always
received, so nothing past that boundary knows the wire shape changed.
`useReportSections` replaces the seven gated hooks; `ReportsScreen.test.tsx`
was rewritten around one gated query instead of seven, and the local
integration suite (`supabase/tests/reports.test.ts`) still passes unchanged
against the wrapped functions.

### The per-session table is unpaged — phase 9 → later

BUILD-SPEC 15.12 section 4, and the same shape as the phase 6 item about the
player directory.

`report_session_table` returns every session that ran in the month — about
fifty at twelve sessions a week — and the screen renders them all in a
`ScrollView`, sorting them on the phone so re-ordering costs no request. Fifty
rows is nothing; a `FlashList` would be the answer at ten times that, and the
sort would then have to move back to the server.

**Left open, on purpose, on the same pass that closed the player directory's
sibling item below.** The two are not actually the same shape once looked at
closely. The player directory paginates cleanly because sorting there was
already a server round trip — `search_players` has always taken `p_sort`, so
giving it a cursor added a capability without removing one. This table's sort
is client-side specifically _so that_ re-ordering costs nothing, and a cursor
here would take that back for a page not yet a real length: today the whole
month still arrives in one `report_sections` call (see the item above), so
paginating this table would mean fetching a `p_sort`-scoped page, then paying
a fresh request every time the coach taps a column header — a strictly worse
screen at fifty rows, in exchange for nothing, since the trigger this item
names has not fired. It also is not a same-shape swap the way the fold above
was: this table is one card inside `ReportsScreen`'s page-level `ScrollView`,
and a `FlashList` genuinely virtualizing inside that would need the screen's
scroll architecture rebuilt around one list of mixed section types, the way
`AdminScheduleScreen` already does for its day headers and session cards —
which is a bigger, different task than "paginate this table," and one this
item does not ask for. **Closing it still means what it said: only if the
academy ever runs enough sessions to notice.**

### The report has not been read at arm's length in Arabic — phase 9 → phase 10

Section 19.3 item 5, and the same debt every phase since 2 has carried. The
screen has a test that renders all nine sections in Arabic and asserts on the
Arabic copy, the Levantine month names and the Western digits; that proves the
strings resolve, not that a month of figures reads well mirrored on a phone.

The two places most likely to want a second look are the weekly bars, which
grow from the reading start edge, and the three-column money row on each
session, which is the densest line in the app after the court board.

**Closing it:** phase 10's Arabic review, which already owns this.

---

## Raised in phase 10

### ~~The vector logo, and everything downstream of it~~ — closed in phase 10

BUILD-SPEC 23.3 and section 24 question 4.

The client's vector files landed: `pob-icon.svg` (mark plus the black circle
badge), `pob-icon-small.svg` (a thicker-stroke variant for sizes where the
racket stringing would otherwise dither) and `pob-mark-transparent.svg` (the
mark alone, no badge). Kept at `assets/brand/` alongside the three pre-rendered
PNGs the client also sent. The mark is a shuttlecock and racket in the app's
existing palette — the green from 17.1's dark theme, not a new color.

Everything the icon and splash config point at is regenerated from these:
`icon.png` is the 1024 badge flattened onto `#111111` (Apple's icon slot
rejects the alpha the source PNG carried around the circle); `splash-icon.png`
is the transparent mark at 2x; the three Android adaptive layers
(`android-icon-foreground.png`, `-background.png`, `-monochrome.png`) are
rendered from the transparent mark scaled to sit inside the safe-zone circle
launchers actually show, with the monochrome layer as a plain white silhouette
on the same alpha; `favicon.png` comes from the small variant. No `.svg` renderer
was on this machine, so headless Chrome did the rasterizing, screenshotting an
HTML page that sizes and centers each SVG rather than trusting the file's own
intrinsic dimensions.

**What is still behind it:** the store screenshots. `store/screenshots.md`'s
six screens and four sets need a dev build carrying this icon, not the
placeholder, so the capture session still wants the same device pass
everything else in _Verification debt_ is waiting on — now unblocked rather
than blocked on the client.

### ~~The privacy policy has no host~~ — closed, phase 10

BUILD-SPEC 23.3 and assumption A83. Same item as "Where the password reset
link should land" at the top of this file — one decision closed both. See
there for the host (`docs/privacy-policy/`, now primarily Vercel, GitHub
Pages kept live alongside it) and what is still a manual step.

### ~~Migrations have not been applied to prod~~ — closed, deployment

BUILD-SPEC 23.2: "Migrations applied to prod before the build is submitted,
never after."

Thirty-six migrations exist and every one of them has run against a local
stack, which is what `npm run test:db` proves. `pob-prod` is a project this
repository has no credentials for, so this is a deployment action rather than a
code one. `store/README.md` carries it as the second line of the release
checklist, together with the two cron invocations that are also deployment
steps (the payment proof purge and the push outbox drain) and the `eas
env:create` lines the production profile now depends on.

**Closed.** `pob-prod` itself didn't exist yet either — created fresh
(Frankfurt region, closest to Amman of the regions on offer), then `supabase
link` and `supabase db push`: all 41 migrations applied. Followed by the
venue, cost, package and template portions of `seed.sql` only, run by hand
against the linked project — never the dev-only portion, which creates
`auth.users` rows directly and must never touch prod. **Verified by count**,
not just by a clean exit code: 2 venues, 12 templates, 5 packages, matching
`seed.sql` exactly.

### The matchmaking performance fixture is contention-sensitive — phase 10 → watch it

BUILD-SPEC 19.2's last row: 20 players over 6 rotations in under 300ms.

Run on its own the fixture takes about a fifth of its budget. Run as one of
sixty-nine suites on a loaded machine it has been observed at 338ms and failed
once during this phase, then passed three times in a row alone.

The budget was left alone — it is an acceptance criterion about a phone, and
widening it to accommodate a laptop running Jest would be measuring the wrong
thing. What changed is the sampling: the fixture now runs the generator six
times, discards the first as a warm-up, and asserts on the fastest of the
remaining five. A genuine regression makes every sample slow and still fails; a
neighbouring suite stealing a core for one of them no longer does. Three
consecutive full runs passed after the change, against two failures in five
before it.

**Closing it:** done, as far as a shared machine allows. If it is ever seen
failing again, the next step is to assert on the hill climber's iteration count
rather than on a clock — the engine's real bound is 13.6's 150ms per rotation,
and the iteration count is the thing that is actually deterministic.

**That next step is now done too**, ahead of it failing again. `hillClimb`
(`src/features/matchmaking/engine.ts`) returns the iteration count it actually
ran instead of `void`, `generateLineup` sums it across every rotation onto the
new `Lineup.hillClimbIterations` field (additive — `saveLineup` reads only
`rotations` and never persists it), and the fixture now asserts
`hillClimbIterations === HILL_CLIMB_MAX_ITERATIONS * 6` with no `Date.now()` in
the test at all. This works because the 338ms this item already observed for
all six rotations together is still only ~56ms each — comfortably inside the
150ms-per-rotation budget that would have to trip for the count to come back
short — so the worst run this suite has actually seen would still pass the new
assertion. Verified by running the fixture file alone three times in a row.

### The court board and the report still have not been read at arm's length

Section 19.3 item 5, and the item under **Verification debt** above, which this
phase did not close.

What phase 10 did close is the part a test can hold: every screen renders in
Arabic under test, every loading, empty and error state is now forced by a test
rather than only written (`19.3 item 6` blocks throughout the screen suites),
the 44-point touch target and the 18-point court name are asserted in
`src/components/__tests__/interactionRules.test.tsx`, and D72's WhatsApp
affordance is held on every player screen by
`src/screens/player/__tests__/whatsappCoverage.test.tsx`.

What it did not close is a phone. Three surfaces still want one, and the reasons
have not changed: the court board, which must not mirror and is read across a
gym; the reports screen, which is almost entirely numbers; and the announcement
list, which is the one screen whose direction is per-message rather than
per-app.

**Closing it:** a dev build on one iOS and one Android device, in both
languages. It is now blocked behind the logo as well, since the same build is
what the screenshots come from.

---

## Raised in the device verification pass

The first actual device pass this item and "The court board has not been read
at arm's length" were waiting on — an iOS Simulator dev build, driven screen by
screen. Found in progress; each entry says what was wrong and what closed it.

### Every card title, and every other non-centered `Text`, sat flush left in Arabic — closed

The single highest-impact bug this pass found. Every screen that has ever been
"viewed in Arabic" was viewed only through a unit test's snapshot of rendered
strings (19.3 item 5's own gap, named in this file's "Verification debt"
section above) — never through an actual RTL layout pass on a device, which is
the only way this was ever going to be caught.

**The bug.** `Text.tsx` defaulted `textAlign` to RN's `'auto'`. On iOS,
`'auto'` resolves via the _device's own OS locale_, not the string's content
and not the app's own chosen language — so on a device whose OS locale is
English (unremarkable; BUILD-SPEC 16.1 deliberately starts every install in
Arabic _regardless_ of device locale, so this is not an edge case, it is the
expected shape of a real user's phone), every Arabic heading, label, and body
line rendered flush left instead of right, everywhere a `flex: 1` box gave it
room to show. Centered text (button labels) was unaffected, which is exactly
why this had stayed invisible: the screens that got even a cursory look leaned
on centered buttons, not left/right body text.

**The fix took two tries, and the second one is the one worth remembering.**
The first attempt set the default explicitly from `theme.isRTL` (already
correctly `I18nManager.isRTL`) — `theme.isRTL ? 'right' : 'left'` — which
should have worked and visibly didn't, confirmed on device with a raw RN
`<Text>` and a hardcoded `textAlign: 'right'`, no wrapper involved. The reason:
React Native treats a _literal_ `'left'`/`'right'` on `textAlign` as a logical
value once `I18nManager.isRTL` is true, and auto-mirrors it — the same
treatment `flexDirection: 'row'` already gets. So `'right'` under RTL renders
physically left, cancelling the fix; swapping the hardcoded test value to
`'left'` was what actually moved text to the right edge. The real fix is
`Text.tsx` defaulting to a bare `'left'` unconditionally, with no `isRTL`
branch at all — RN's own mirroring does the rest, the same way none is needed
for the row layouts elsewhere in the app.

**Confirmed fixed app-wide**, not just on `SessionCard`: the same default
lives in one place (`Text.tsx`), so every screen using the primitive picked it
up at once. Verified on `ScheduleScreen` and `SessionDetailScreen` directly;
two component-level workarounds tried mid-diagnosis (`alignItems: 'flex-end'`
on `SessionCard`'s and `BookingCard`'s title boxes) were reverted once the
real fix landed, since they turned out to be unnecessary — the box was never
the problem, only the text within it.

No other call site in the app passes an explicit `align="left"` or
`align="right"` to `Text`, so this default change has no other blast radius to
check.

### 15.2's Players tab and 15.2's Money tab both errored on every session, always — closed

Found by actually opening a session as the coach — every session, seeded or
freshly created, no exceptions. Both tabs showed the generic "Something went
wrong" state on load.

**The bug.** `fetchSessionRoster` (`src/features/bookings/api.ts`) and
`fetchSessionReview` (`src/features/payments/api.ts`) both embed
`profiles ( first_name, last_name, tier )` from `bookings` with no foreign key
named. `bookings` carries three separate foreign keys into `profiles`
(`player_id`, `created_by`, `cancelled_by`), so PostgREST cannot infer which
one the embed means and refuses the whole query — `PGRST201`, "more than one
relationship was found for 'bookings' and 'profiles'". Confirmed directly
against the local stack's REST API, bypassing the app entirely, to rule out a
client-side red herring before touching any code.

Neither the Jest suite nor `supabase/tests` caught this: Jest mocks the
Supabase client and never reaches real PostgREST, and this exact query shape
apparently was never exercised by a `supabase/tests` fixture. A device pass
driving these two tabs by hand was the only thing that was ever going to find
it — exactly what this section's opening paragraph says about why this pass
exists.

**Closed.** Both embeds now name the foreign key explicitly —
`profiles!bookings_player_id_fkey ( ... )` — matching the pattern
`fetchPlayerTierHistory`'s `actor:profiles!audit_log_actor_id_fkey` and the
court board's `pairing_rules` queries already used correctly elsewhere. Swept
every other `profiles` embed in `src/features/*/api.ts` for the same
unqualified pattern — no others found. Verified three ways: the raw REST call
against the local stack now returns data instead of `PGRST201`; both tabs
render their real content (an empty roster, and the money summary) instead of
the error state, on device; and `npm run test:db` — 542 of 543 passing, the
one failure a false positive from this same manual pass consuming one of
`player001`'s seeded credits by actually booking a session with one, not a
regression.

### Arabic month names are now modern (MSA), not Levantine — closed, by client instruction

BUILD-SPEC 16.1 originally specified Levantine month names (آب, أيلول, كانون
الثاني, …) deliberately, for the Jordan audience — tested specifically in the
Reports screen per this file's own "Verification debt" section above.
Overturned by direct instruction during this pass: `ARABIC_MONTHS` in
`src/lib/time.ts` now holds the modern, Gregorian-transliterated names
(أغسطس, سبتمبر, يناير, …) instead. Every place that read as "Levantine" in a
comment or a test name was updated to match — `src/lib/time.ts`,
`src/lib/__tests__/time.test.ts`, `src/features/sessions/__tests__/
announcementDraft.test.ts`, `src/screens/player/__tests__/ScheduleScreen.test.tsx`,
`src/components/primitives/DateField.tsx`, `src/features/announcements/
relativeTime.ts`. Digit formatting (Western numerals, C1's own subject) is
untouched — this is a wording change only.

### Tab bar icons were never wired up — closed

Neither `PlayerNavigator.tsx` nor `AdminNavigator.tsx` passed a `tabBarIcon` to
any of their eight tabs, so every tab rendered React Navigation's own
`MissingIcon` placeholder — a triangle — in place of a real icon, on both
sides of the app. Section 2.1 had no icon library and 17.3's component list
never specified one, so this was a genuine gap rather than a wiring bug in
otherwise-specified code.

**Closed, by client instruction.** `@expo/vector-icons` (Ionicons) is now in
2.1 — ships inside every Expo project already, no native linking, tints via
`color` the same way `Text` already does. A small `Icon` primitive wraps it;
`Button` grew an optional leading `icon` prop; `WhatsAppButton` now carries
`logo-whatsapp`. Both navigators' eight tabs have a filled/outline icon pair
that swaps on focus (Sessions/calendar, My bookings/bookmark,
Announcements/megaphone, Profile/person-circle; Today, Schedule/calendar,
Players/people, More/ellipsis-circle).

### The auth screens' footer link was left-aligned instead of centered — closed

`AuthLayout`'s footer `View` sets `alignItems: 'center'` deliberately, but
`Button` hard-codes `alignSelf: 'flex-start'` whenever `isFullWidth` is not
set — the correct default for an ordinary container (RN's own default
`alignItems` is `stretch`, so without it a plain button would stretch full
width), but it overrides a parent that has explicitly opted into centering.
All four screens that use the footer slot (`SignIn`, `SignUp`,
`ForgotPassword`, `VerifyEmail`) hit it: "No account yet?" sat centered while
"Create account" sat flush left under it, and the same split on the other
three screens' equivalent link.

**Closed.** Each of the four footer buttons now takes an explicit
`style={styles.footerButton}` (`alignSelf: 'center'`), scoped to just that
call site rather than changing `Button`'s default — which stays correct for
every other (non-footer) use across the app.

### The local Supabase stack's containers do not survive a full disk — not a code bug, worth knowing

Hit mid-pass: the Mac's disk filled to zero free space (unrelated to this
project — general system state), and when Docker's containers came back after
freeing space, `docker ps -a` showed none at all, not even stopped — the
local stack's containers had been removed outright, though the underlying
volume (and the seeded data in it) survived. `supabase start` re-pulled the
images and reattached to the existing volume cleanly. Worth knowing because
the symptom looked exactly like an app bug — sign-in returned a generic
"Something went wrong" — until `curl`ing the auth endpoint directly showed
`Connection refused` rather than a real 401/400 from a running server.

---

## Raised in the first submission pass

### Android has now been run on an emulator — partly closes the device debt

Reported by the client during this pass: the app was run on an Android
emulator and everything read correctly. That is the first time Android has been
exercised at all — "Android has not been run at all. `android/` has never been
prebuilt" in the entry above is now out of date — and it covers the things a
first Android run was most likely to break: the shortened app name, the drawn
shuttlecock icon, the native time wheel and the RTL layout.

**What an emulator still does not settle**, and what the remaining smoke test
is for:

- **Push on a real handset.** FCM reaches an emulator only if that image ships
  Google Play services, and the notification then arrives through a very
  different path than on a phone. Section 18's done-when is one announcement
  and one waitlist spot landing on a real device and opening the right screen.
- **The fresh-install RTL reload.** `alignLayoutDirection` only fires when the
  stored native direction disagrees with the resolved locale, which is the
  first launch after a clean install in Arabic. A session that has already
  launched once never re-enters it. Delete and launch once, in Arabic.
- **The court board drag.** The gesture has no test behind it at all — a pan
  handler cannot be driven through the renderer — and a mouse drag on an
  emulator is not a thumb on glass across a gym.
- **Gym lighting and arm's length**, which is what 13.10's 18pt floor and the
  reports screen's dense money rows were sized for.

### The Play developer account is Personal, which costs three weeks — found in the submission pass

Not something BUILD-SPEC could have called out: 23.2 treats Play submission as
a checklist item, and it is not one.

The account exists and the $25 is paid — `Yousef Alkhatib`, account ID
`8107503913762265459` — but two things about it were only visible by opening
the console:

**Nothing can be created yet.** _Create app_ is disabled behind a lock reading
"Complete account verifications to create new apps". Three verifications are
outstanding, and every one of them is bound to a person rather than to this
repository: an official identity document (Google warns it "may take a few
days"), proof of access to a real Android device via the Play Console mobile
app, and a contact phone number that is itself gated behind the identity check
clearing. So the store listing, the data safety form, the screenshots and the
privacy policy URL have no surface to be entered into yet.

**It is a Personal account, and the type cannot be changed after creation.**
Personal accounts created after 13 November 2023 must run a closed test with
12 testers opted in continuously for 14 days before production access can even
be _applied_ for, and since 2026 Google checks that those testers actually used
the app. An organization account is exempt, but needs a D-U-N-S number
(~30 days) and a second registration, which is the slower road from here.

**What this means for the release order.** The Android critical path is no
longer "build, submit". It is: identity verification clears (days) → create the
app and fill the listing → upload this `.aab` by hand → closed test with 12 real
people for 14 continuous days → apply for production access → review. Three
weeks minimum, and the clock does not start until the identity document is
approved.

The academy's own players are the natural 12: they are the real users, and the
engagement check makes a roster of genuine testers worth more than a roster of
volunteers.

### The first production Android bundle exists — closed

`eas build --platform android --profile production`, 2026-08-30: version 1.0.0,
version code 7, built from commit `dcb3203` with source maps uploading to
Sentry (the `SENTRY_DISABLE_AUTO_UPLOAD` escape hatch is gone and the build no
longer needs it). Signed `.aab`, ready to upload the moment Play lets an app be
created.

### The lockfile regression that failed the first submission build — closed

`store/README.md`'s new "Before any production build" section, and the third
bullet of "First successful production Android build" above, which recorded
this exact failure the first time.

It came back. Between that build and this one the device-testing pass ran
`npm install` under the machine's default Node 24.12.0 / npm 11.6.2, which
regenerated `package-lock.json` with 1134 entries where npm 10.9.8 resolves
1091 — the difference being `@unrs/resolver-binding-wasm32-wasi`'s `@emnapi/*`
subtree. EAS's build image runs npm 10.9.8, so `npm ci` failed and took the
build down in the Install dependencies phase after 16 seconds.

**Closed, and guarded this time.** Regenerated under Node 22.23.1 and verified
the only way that actually proves anything: `package.json` and
`package-lock.json` copied to a scratch directory and `npm ci` run for real
under npm 10.9.8 — exit 0, 1090 packages. `npm ci --dry-run` is not a check
here; it reports "up to date" in 600ms without resolving anything.

`.nvmrc` now pins 22.23.1 and `store/README.md` carries the reproduction
recipe, because the failure is invisible locally: every command a developer
would think to run passes on the machine that produced the broken lockfile.

### What prod actually contains, counted rather than assumed — closed

The concern was dummy data reaching production. It has not.

`pob-prod` holds **0 auth users, 0 profiles, 0 bookings, 0 subscriptions,
0 credit transactions, 0 balance entries, 0 payment proofs, 0 device tokens
and 0 announcements**. What it does hold is reference data and machine output:
2 venues, 12 session templates and 5 packages from `seed.sql`'s reference
portion (matching the counts recorded when prod was created), 44
`session_instances` generated by the nightly `generate_sessions(21)` job
covering 2026-08-27 to 2026-09-20, and 100 `audit_log` rows that are all
`session_instances` INSERTs and UPDATEs written by those same cron jobs.

The dummy data lives only in the local stack, which is exactly where
`seed.sql`'s dev-only portion was always scoped to stay.

All 44 migrations are applied — `supabase migration list --linked` shows local
and remote agreeing on every version, including the three that post-date the
"Migrations have not been applied to prod" entry above. All seven cron jobs are
active on the schedules 8.6 asks for, and the `audit_log` rows are the evidence
they are firing rather than merely registered.

### The Play listing had no feature graphic — closed

Play will not publish a store listing without a 1024 × 500 feature graphic, and
nothing in `assets/` was one. `store/play-assets/` now carries it in both
languages plus the 512 × 512 listing icon; `store/README.md`'s "Play listing
assets" section records what goes where. The Arabic graphic mirrors the layout
and not the mark, for the same reason `TierChangeRow` spells out a before/after
pair rather than drawing an arrow.

---

## Raised in the client review pass

A screen-by-screen review by the client, on a device, after the device
verification pass above. Twenty-odd items, most of them small enough to close
in the diff and not worth a page here. What follows is the subset that either
amends a decision already recorded in this file or in BUILD-SPEC.md, or that a
future reader would otherwise reasonably think was a mistake.

### `Text` no longer defaults to a bare `'left'` — amends the entry above

"Every card title … sat flush left in Arabic" ends by saying the fix is a bare
`'left'` "with no `isRTL` branch at all". That is right, and it is right for
exactly one reason: it is correct _while the native layout direction and the
app's language agree about direction_. They do not always.

`I18nManager.forceRTL()` only takes effect after a reload, which is what
`useChangeLanguage` exists to arrange — but a reload that does not happen, or
happens without the native side picking the flag up, leaves the app running
English strings inside an RTL layout. The client saw exactly that: in English,
the sign-up title and every field label sat on the right.

`Text` now defaults to `theme.alignStart`, which compares the two directions
and cancels RN's mirroring out: when they agree it is `'left'` (the old
behaviour, unchanged); when they disagree it is `'right'`, which mirrors back
into the reading edge the _language_ wants. The finding the entry above
records — that RN mirrors literal left/right values — is unchanged and is what
the comparison is built on.

Two other places had the same latent bug and are fixed the same way:

- **`Input`** never set `textAlign` at all for a non-LTR field. UIKit's
  `NSTextAlignmentNatural` resolves against the _device's_ preferred language,
  so an Arabic install on an English phone put the caret at the left edge of
  every field — the same shape of bug as the `'auto'` one above, one component
  over. `isLTR` now controls only `writingDirection`: an address, a phone
  number and a dinar amount still read left to right inside the box, and the
  box sits at the reading edge of the language around it.
- **`directionStyle`** (announcements, 14.11) was mirrored the wrong way and
  was therefore _reversing_ per-message direction under RTL: an Arabic notice
  rendered flush left and an English one flush right, which is the one outcome
  14.11 exists to prevent. It now takes the layout direction as an argument;
  the tests drive both layouts.

### Dates are numeric — amends 16.1

"20 August 2026" / "20 أغسطس 2026" is now `20/8/2026`, in both languages, on
direct client instruction. Day first, Western digits (16.1's actual rule, which
is unchanged). `formatSessionDate` is the only place it is decided, so all
forty-odd call sites moved together. `formatWeekLabel` follows it (`5/7`),
because a chart axis has less room than anything else in the app.

`formatMonthLabel`, the report month picker, was left spelled at first — it
names a month rather than a date — and the client's answer was "make it all
numeric". It reads `8/2026`: month then year, so it is the tail of
`formatSessionDate`'s `22/8/2026` rather than a second convention on the same
screen, and no leading zero, for the same reason a day does not carry one.

With that, nothing in the app looks a month up by name, and both month-name
arrays are gone from `src/lib/time.ts`. 16.1's spelled month has now been
amended twice — Levantine to MSA in the device verification pass, MSA to
digits here — and there is no third form left to pick.

### 12.1's cost model now has per-session overrides — amends 12.1

12.1 derives a session's cost from three effective-dated rate tables and
nothing else. The client's account of a real month says nights depart from the
rates in four ways: an assistant coach paid more than the standard fee, more or
fewer packs of water than usual (sometimes none at all), snacks and shuttles
bought on the night, and a session that ran late and was charged for the extra
court time.

Migration 0043 adds a nullable override beside each of the three rated costs,
and a `session_extra_costs` table for the things that have no rate to override.
`v_session_costs` is the one place the total is now assembled, and the four
places that previously wrote the three-column sum out by hand — 0010's
`v_session_financials`, 0027's `get_session_money_summary`, and 0036's
`report_totals` and `report_sessions` — all read it. `report_totals` gained an
`extras_fils` column, so its signature changed and the function was dropped and
recreated.

Effective dating is untouched and 12.1's warning still holds: an override
belongs to one instance, so neither editing a rate nor typing an override
rewrites a historical figure. Verified against production after the migration:
the view agreed with the old three-column sum on all 40 existing sessions, so
no reported number moved.

`recompute_night_costs` (0017) is deliberately _not_ aware of the overrides. It
keeps dividing the night's rent across the night's sessions and writing the
`*_share_fils` columns, which is what makes a correction survive another
session being added to or cancelled from the same night — a single column would
have been silently erased by the next recompute.

### A start time is picked, not typed

`TimeField`, `DateField`'s twin, replaces the free-text `HH:mm` field on both
staff session forms. The coach reads a 12 hour clock everywhere else in the app
(16.1) and was converting in his head to type into this one field, and the
field accepted "7pm", "19" and "1900", none of which
`sessions/schemas.ts`'s pattern allows.

One test was retired rather than fixed: `SessionEditScreen`'s "refuses a
malformed time" typed `7pm` into the field and expected the schema to reject
it. There is no field to type into any more. It is replaced by a test that the
wheel's value reads back as a 12 hour clock; `editSessionSchema` still rejects
a malformed time and the schemas suite still covers that, because a form value
can arrive from somewhere other than a keystroke.

### A letter in a money field took the screen down

`CreateSessionScreen`'s summary line and `SessionEditScreen`'s price-change
check both ran `fils(Number(value))` **during render**, on every keystroke.
`fils()` throws on a non-finite number by design (5.3, and that is the right
behaviour at a form's edge), so one letter crashed the screen before the schema
could report it. Both fields are now `FormNumericInput`, which normalises at
the point of entry, and both previews go through the new `parseFils`, which
answers `null` for a value that is not a number yet. The schemas are unchanged.

`CreateSessionScreen`'s submit is deliberately _not_ disabled on
`formState.isValid`, unlike 14.2's sign up: on a seven-field form a disabled
button says something is wrong and not what, whereas tapping it runs the
resolver over every field and puts a message under each one that needs it.

### The profile screen is now role-aware — A28

A28 mounts 14.12's profile under the staff _More_ stack as well. Three sections
now differ, on client instruction: credits and subscriptions and _Message the
coach_ are the player's alone, and the notification-permission section is
staff-only. The role comes from `useMyProfile`, which the screen already reads.

`LanguageSheet.tsx` is added to `whatsappCoverage.test.tsx`'s exempt list. It is
a two-line picker in a modal, not a screen, and the screen that opens it carries
the affordance itself.

### A rotation can be deleted — extends D62/A15

0038 added `add_rotation` for A15's seventh round and had no inverse; a night
does not always run the number of rounds it was planned for. `remove_rotation`
(0042) deletes the round the chips are showing — _any_ round, per the
instruction, not only the last — and closes the gap so the indexes stay
contiguous from 1.

Unlike Regenerate and Add a rotation it does not rebuild the board: the rounds
that remain keep the pairings the coach has already read out. It does not
re-derive their `rule` from the new index either, for the same reason —
relabelling round 3 as round 2 would describe its existing pairings wrongly.
Regenerate is there if he wants 13.2's alternation to line up again.

### Two migrations were applied through the management API, not `db push` — closed

0042 and 0043 were applied to `pob-prod` directly, at the client's instruction.
The CLI could not be used _for the remote_: `db push` and `migration list`
hang on their database-password prompt in a non-interactive shell,
indefinitely and with no output, though the database host itself answers on 5432. `supabase migration up --local` needs no password and works normally —
it is only the remote connection that is unreachable this way. The management
API stamps a timestamp version rather than this repository's `0001..`
numbering, so both rows were renamed to `0042` and `0043` afterwards.

**Both databases had to be told, and only one was, at first.** `.env` points
`EXPO_PUBLIC_SUPABASE_URL` at `http://127.0.0.1:54321` — the app in the
simulator talks to the _local_ stack, not to `pob-prod` — so applying only to
the remote left every new object missing from the database actually under
development. Deleting a rotation returned a PostgREST "function not found",
which `sessionErrorMessageKey` has no code for and which therefore surfaced as
`error.generic`, "حدث خطأ ما". The cost card would have failed the same way.
Closed with `supabase migration up --local`; both databases now hold all 44.

That renaming left one artefact, and closing it needed a decision rather than a
delete. The API records a migration _after_ running its query, so no migration
can remove its own row — the renaming run tried, and its delete ran before the
row existed. Another migration to delete it would have left another row in its
place, and so on; through this API the steady state is always exactly one
unclaimed row.

**Closed by claiming it rather than chasing it.**
`supabase/migrations/20260827234041_align_migration_versions.sql` is that row's
version as its filename and the two `UPDATE`s as its body. Local files and
remote rows now correspond one to one — 44 each, nothing pending, nothing
remote-only — and the file is a no-op on any fresh database, since 0042 and
0043 apply there under their own numbers and both `UPDATE`s match nothing.

It is the only timestamp-versioned file in a directory of sequential ones,
which is worth knowing when reading `ls`. Everything from here should go back
to `0044`, `0045` and `db push`.

### What the iOS Simulator actually showed, and what it did not

The client review pass was the first time any of this work was run rather than
only tested — an iPhone 17 on iOS 26.5, driven from a debug build against the
local Supabase stack, in Arabic. Four things were established that no unit test
could have established, and two of them were bugs the suite was green through.

**Confirmed by looking:**

- **The app name.** `Badminton.app` installed, `CFBundleDisplayName` read back
  from the installed bundle as `Badminton`, with `PRODUCT_BUNDLE_IDENTIFIER`
  still `jo.professionalofbadminton.app` and the `pob` URL scheme intact. The
  rename had to be verified on the _installed binary_, not in `app.config.ts`,
  because the label lives in the native project and `app.config.ts` is only a
  source for it — which is precisely how it was missed the first time.
- **The welcome screen.** The drifting shuttlecocks and sport icons read as
  intended at 7–14% opacity, and the mint halo the client asked to have removed
  is gone.
- **The input alignment fix.** Latin text typed into 14.2's first-name field in
  Arabic sits flush right with the caret on the right edge, which is the whole
  of what was reported wrong.

**Found by looking, and still open — see "The app runs Arabic inside a
left-to-right layout" below.** The same screenshot that confirmed the input fix
also showed the navigation back chevron on the left and `Input`'s password
reveal control on the right, in Arabic. Both are positional rather than
textual, and both are mirrored by `flexDirection: 'row'` when the layout
direction is right to left. They were not mirrored, so it was not.

**What a simulator could not be used for.** Metro's inspector WebSocket answers
`401` on this machine, so `I18nManager.isRTL` could not be read directly and
the direction had to be inferred from where those two controls rendered. It is
a sound inference — nothing else moves them — but it is an inference, and a
device with a reachable inspector would settle it in one expression.

**Still unlooked-at from this pass**, and none of it is covered by the entries
in "Verification debt" above because none of it existed then: the session cost
card and its two sheets (10.2's money tab), deleting a round from 13.10's court
board _through the UI_ rather than through the RPC, the 50/50 pay row and its
"back to unpaid" link, the three stacked add buttons on 15.2, the language
sheet on 14.12, the pinned contact bar on 14.11, the 12 hour time wheel on 15.4
and 15.6, and the numeric date format everywhere it appears. Every one of those
has unit coverage and none has been seen.

Android has not been run at all. `android/` has never been prebuilt, so its
first generation is also the first time the shortened app name, the drawn
shuttlecock, the native time wheel and the RTL layout will have been exercised
on that platform.

### ~~The app runs Arabic inside a left-to-right layout~~ — closed

`I18nManager.isRTL` was `false` while the app language was Arabic — observed on
the simulator, as described above. Arabic text was correct; anything positional
was mirrored the wrong way.

**Why.** `initI18n` sets the native direction flag on a cold start and does not
reload:

```ts
I18nManager.allowRTL(shouldBeRTL);
if (I18nManager.isRTL !== shouldBeRTL) I18nManager.forceRTL(shouldBeRTL);
```

`forceRTL` only takes effect on the _next_ launch. `useChangeLanguage` handles
that for a language the player switches to, with a restart and a sentence
explaining it — but nothing handles the cold start where the stored native
direction already disagrees with the resolved locale. A fresh install in Arabic
hits it on the first launch, every time, and runs that whole session mirrored
the wrong way.

**This is the common cause of three separate reports in this pass** — English
labels on the right, announcements reversed, and inputs starting on the wrong
edge. All three were closed by making the _text_ independent of the flag
(`theme.alignStart`, `theme.inputAlignStart`, `directionStyle`'s new argument),
which is worth having regardless. What remains exposed is everything
positional: header back buttons, row order, the password reveal control, and
the hand-flipped chevrons in `BookingCard` and `ReportsMonthPicker`.

**Closed.** `alignLayoutDirection` in `src/i18n/index.ts` reloads once during
startup when the two disagree, while the splash screen is still up so the
player never sees it. `initI18n` now returns `{ i18n, isReloading }` and
`App.tsx` holds the splash instead of rendering when `isReloading` is true —
the launch being replaced must not draw, or the player sees the mirroring the
reload exists to correct.

The reload loop this entry warned about is guarded by
`DIRECTION_RELOAD_STORAGE_KEY`, an AsyncStorage marker recording the direction
already attempted, rather than a module-level flag the reload would reset. It
records the _direction_, not merely "tried", so a genuine later switch still
reloads. Every way the guard could fail to be durable — storage unreadable,
unwritable, or the reload itself refused — gives the reload up rather than
risking the loop: one wrongly mirrored session is a blemish, an app that never
opens is not.

The Expo Go / `__DEV__` reload fallback was lifted out of `useChangeLanguage`
into `src/i18n/restart.ts`, so the startup path and the language switch share
one implementation instead of two copies drifting apart.

Held by ten cases in `src/i18n/__tests__/layoutDirection.test.ts`: the fresh
Arabic install that motivated the entry, the two directions that need no
action, the guard being cleared once the direction takes, the second launch
that must _not_ reload again, the opposite-direction switch that still must,
and each of the four failure paths starting the app rather than hanging on the
splash.

**Not verified on a device.** The repair only shows on a genuinely fresh
install, which is exactly the case a simulator pass driving screen by screen
never re-enters. Delete the app and launch once, in Arabic, to see it.
