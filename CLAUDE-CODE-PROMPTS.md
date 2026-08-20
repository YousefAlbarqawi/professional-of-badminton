# Claude Code prompts, one per phase

Each prompt below is self-contained. Start a **fresh Claude Code session** for each phase, in the project directory, with `BUILD-SPEC.md` at the root. Fresh sessions matter: by phase 5 a single conversation will be too crowded to hold the spec reliably.

Copy the whole block, including the standing rules. Do not trim them, they are what stops the agent inventing features.

---

## Phase 0, foundation

```
Read BUILD-SPEC.md in full before writing anything. It is the complete
specification for this app and it is authoritative. Do not summarise it
back to me.

CLAUDE.md is already at the repository root. Do not create or modify it.

Build Phase 0 only, as defined in section 20. Relevant sections: 2 (stack,
conventions, repository layout), 5.1 and 5.3 (time and money rules), 16
(localization), 17 (design system).

Deliverables:
- Expo + TypeScript strict project, folder structure exactly per section 2.2
- ESLint, Prettier, npm scripts for typecheck, lint, test
- src/lib/money.ts, src/lib/time.ts, src/lib/tiers.ts with full unit tests
- Theme tokens from section 17.1, plus Text, Button, Card, EmptyState,
  ErrorState, Skeleton
- i18n initialised with en.json and ar.json and the RTL restart dialog
- Cairo font loaded for Arabic before first render

Done when: the app builds on both platforms, shows a themed placeholder
screen, switches language and text direction, and all three lib test
suites pass.

STANDING RULES
- Section 3 is the decisions register. If a question arises that section 3
  answers, that is the answer. Never add anything listed in section 4.
- Before writing code, list the files you intend to create and wait for my
  go-ahead. After that, work without stopping to ask about details the spec
  already covers.
- Stop at the end of this phase. Report what you built, what you skipped,
  and anything ambiguous or contradictory you found. Do not start the next
  phase.
- On a genuine contradiction, follow Appendix B: leave that piece unbuilt
  and record it under "## CONFLICTS FOUND" at the end of BUILD-SPEC.md.
- Definition of done is section 19.3. All of it.

Start with the file list.
```

---

## Phase 1, schema and security

```
Read BUILD-SPEC.md in full. It is authoritative. Phase 0 is complete.

Build Phase 1 only, as defined in section 20. Relevant sections: 5 (domain
rules), 6 (full schema), 7 (row level security), 22 (seed data).

Deliverables:
- Numbered migration files in supabase/migrations/ covering every enum,
  table, index, view, and trigger in section 6
- Every RLS policy in section 7, including get_session_attendees and the
  guard_profile_privileged_fields trigger
- supabase/seed.sql with venues, templates, night costs, consumables,
  coach fee rate, and packages from section 22, plus the dev-only fixture
  data described there
- Generated TypeScript types committed to src/types/database.ts
- Integration tests against a local Supabase

The security tests are the point of this phase. Prove, with tests:
- anonymous role reads nothing
- a level_0 player calling get_session_attendees gets no names and no tiers,
  only his own row
- a level_1 player gets tiers and no names
- a level_2 player gets both
- any player selecting directly from bookings gets only his own rows
- an admin can read everything except the report views
- the coach can read everything
- a player cannot change his own role, visibility, tier, or custom rates

Do not build any UI in this phase.

STANDING RULES
- Section 3 is the decisions register. If a question arises that section 3
  answers, that is the answer. Never add anything listed in section 4.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 2, auth

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 and 1 are complete.

Build Phase 2 only, as defined in section 20. Relevant sections: 14.0
through 14.5 (auth screens and navigation), 14.12 and 14.14 (profile and
account deletion), 8.7 (delete-account edge function), 3.2 (decisions D10
to D19).

Deliverables:
- Sign up with exactly the five fields and validation rules in section 14.2
- Email verification screen with resend cooldown and polling, per 14.3
- Sign in, forgot password, sign out
- Trigger creating a profiles row on auth.users insert
- Token persistence in expo-secure-store, refresh handling, full clear on
  sign out
- RootNavigator switching by role: player, assistant_coach, admin, coach
- Profile screen per 14.12
- Delete account screen and the delete-account edge function per 14.14 and
  assumption A1

Constraints worth restating: email and password only. No OAuth, no magic
links, no phone auth, no SMS anywhere. No coach approval for new accounts.

Done when: a new user can register, confirm by email, sign in, be routed to
the player navigator, and delete the account, and a deleted account cannot
sign in.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3, including both language files.

Start with the file list.
```

---

## Phase 3, sessions and schedule

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 2 are complete.

Build Phase 3 only, as defined in section 20. Relevant sections: 3.1
(schedule), 5.2 and 5.5 (booking window, session states), 8.1 (session
generation), 12.1 (cost allocation), 14.6 and 14.7 (player schedule and
session detail), 15.1 and 15.3 to 15.6 (admin schedule screens).

Deliverables:
- generate_sessions() plus the pg_cron jobs in section 8.6
- recompute_night_costs() per section 12.1
- Player schedule list, grouped by day, with occupancy, per 14.6
- Session detail with all three visibility variants and the eight-state
  primary action table in 14.7. No booking yet, buttons can be inert.
- Admin: today list, schedule list, edit a dated instance with the capacity
  guard, create one-off session, cancel session with the announcement prompt
  described in 9.4

Watch these specifically:
- The player sees exactly 5 days. Generation runs 21 days ahead. Both are
  deliberate.
- Cancelling one of two sessions on the same night must double the surviving
  session's court cost share.
- The capacity guard blocks a court reduction below current bookings. It
  never auto-removes anyone.
- Cancelling sends no push notification. That is decision D31, not an
  oversight.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 4, bookings

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 3 are complete.

Build Phase 4 only, as defined in section 20. Relevant sections: 8.2 to 8.4
(booking, cancellation, waitlist functions), 9 (the complete rule set),
14.8 to 14.10 (booking sheet, my bookings, booking detail), 15.2 (admin
session manage, players tab), 3.3 and 3.5 (decisions).

Deliverables:
- create_booking, cancel_own_booking, admin_remove_booking, notify_waitlist
- Booking confirmation sheet with cash and credit paths. CliQ comes in
  phase 5, so leave that option disabled with a clear placeholder.
- Waiting list join and leave
- My bookings and booking detail
- Admin: add registered player by name search, add paid guest, add free
  guest, add assistant coach, remove player with the credit return prompt

The rejection table in section 9.1 is the specification for this phase.
Every row needs a test producing that exact error code.

Two things that must be tested rather than assumed:
- Two simultaneous create_booking calls on the last spot produce exactly
  one booking and one session_full. The FOR UPDATE lock in 8.2 is what
  makes this work; do not remove it.
- The 3 hour cancellation boundary, tested at 2h59m and 3h01m before start.
- A spot freed 40 minutes before start notifies nobody. That is D28.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 5, payments

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 4 are complete.

Build Phase 5 only, as defined in section 20. Relevant sections: 10 (payments
and the review workflow), 8.5 (record_payment, confirm_session_review), 5.3
(money), 15.2 Money tab, 15.8 section 6 (player balance in the admin profile).

Deliverables:
- CliQ path in the booking sheet: alias with copy button, image pick,
  resize to 1600px and compress to JPEG 0.7, upload to
  payment-proofs/{user_id}/{booking_id}.jpg, then create the booking
- Storage bucket policies: a player inserts only under his own user id,
  only staff can read
- Review screen per 10.2, with mark paid, partial, not paid, view proof,
  change method, remove from session
- record_payment with the balance rules in 8.5
- confirm_session_review and reopen_session_review
- The 7 day lock job and read-only state after it

Non-negotiable behaviours:
- A booking with payment_method 'cliq' must never exist without a proof row.
  If the upload fails, no booking is created.
- record_payment rewrites the booking's balance entry, it never duplicates
  it. Test: 6 JD expected, record 4 JD, one entry of 2 JD exists. Then
  record 5 JD, exactly one entry of 1 JD exists.
- All money is integer fils. No floats anywhere in this phase.
- After the 7 day lock, every mutation on that session is refused.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4. In particular: no card payments, no OCR, no refunds inside
  the app, no approval step on CliQ.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 6, subscriptions

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 5 are complete.

Build Phase 6 only, as defined in section 20. Relevant sections: 11
(subscriptions), 8.2 pick_subscription, 8.6 the expiry job, 14.13 (player
subscription screen), 15.9 and 15.10 (grant, adjust credits), 3.6
(decisions D48 to D57).

Deliverables:
- Grant a subscription from the admin player profile, per 15.9
- Extend, blocked once expired
- Adjust credits with a required note, per 15.10
- The nightly expiry job writing a zeroing transaction, then voiding
- Credit booking path using pick_subscription: nearest expiry first,
  tie-break oldest
- Credit return on cancellation outside 3 hours, no return inside, with a
  coach override
- Player subscription screen with per-subscription balances and full
  transaction history

The migration flow is a real, immediate requirement and must work end to
end: grant the 40 visit package, adjust by minus 13 with a note, balance
reads 27, and the history explains itself. Do not build a separate import
screen.

Two rules that are easy to get wrong:
- The credit balance is always the sum of the ledger. There is no counter
  column. Do not add one as an optimisation.
- A credit is worth the per_visit_fils snapshotted on the subscription,
  never the session price. This matters for phase 9.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4. Subscriptions are never purchasable in the app.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 7, matchmaking

```
Read BUILD-SPEC.md in full, then read section 13 twice. It is authoritative.
Phases 0 to 6 are complete.

Build Phase 7 only, as defined in section 20. Relevant sections: 13 (the
whole engine), 19.2 (the fixture suite), 15.2 Court board tab, 3.7
(decisions D58 to D68).

Build it in two distinct parts, in this order.

PART 1, the engine as a pure module with no React and no Supabase imports:
- src/features/matchmaking/engine.ts, weights.ts, scoring.ts, types.ts
- Seeded RNG so every test is reproducible
- Rule assignment: odd rotations rule 1, even rotations rule 2
- Scoring exactly as section 13.5, with the weights in a separate exported
  constant so they can be tuned without touching the algorithm
- Partner repeat weight 25 for standard sessions, 8 for extended
- Hill climbing per 13.6, capped at 400 iterations or 150ms
- Under-capacity handling per the table in 13.7

Every fixture in section 19.2 is a test. Assert properties, not exact
output. All twelve must pass before you write a single line of UI.

PART 2, the court board UI:
- Rotation chips, court cards, player tiles, resting section, per 13.10
- Drag to swap and tap-to-swap, both required
- Court locking by long press, pairing rules
- Auto regeneration governed by has_manual_lineup, with the staleness
  banner and a confirming regenerate button, per 13.8

Legibility is a real requirement here. The coach reads this aloud across a
gym. Player names at 18pt minimum, no truncation under 12 characters.

The court board does not mirror in Arabic. Court 1 stays leftmost in both
languages because it maps to the physical hall.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4. No scores, no wins, no attendance.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list for Part 1 only.
```

---

## Phase 8, announcements and push

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 7 are complete.

Build Phase 8 only, as defined in section 20. Relevant sections: 18
(notifications), 14.11 (player announcements), 15.11 (admin composer), 8.4
and 8.7 (notify_waitlist, send-push).

Deliverables:
- Announcement composer with language selector, 2000 character counter,
  preview, and a confirmation dialog stating how many devices will receive it
- Player announcement list and detail, with per-message text direction
  detected from the content rather than the app language
- Soft delete, which does not recall the push
- Device token registration on login and every cold start, stored in
  device_tokens with the device's locale
- send-push edge function using the Expo push API, pruning dead tokens from
  the receipt response
- Deep links: waitlist push to session detail, announcement push to detail
- Contextual permission request the first time a player joins a waiting
  list, never on first launch

Exactly two things push: a waitlist spot opening more than one hour before
start, and a new announcement. Nothing else. No booking confirmations, no
reminders, no cancellations, no expiry warnings. If you find yourself
adding a third trigger, stop and re-read D70.

Done when a real device on each platform receives both notification types
and lands on the right screen.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 9, reports

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 8 are complete.

Build Phase 9 only, as defined in section 20. Relevant sections: 12 (costs,
revenue, profit), 15.12 (the nine report sections), 5.3 (money).

Deliverables:
- All nine sections in 15.12, with a month picker
- Coach only, enforced in RLS and in the API, not merely by hiding the tab.
  An admin hitting the endpoint gets a permission error.

The three revenue rules in 12.2 are the whole point of this phase and the
easiest thing to get subtly wrong:
1. A credit is worth the per-visit rate of the subscription it came from,
   between 4.000 and 5.000 JD. Never 6 JD.
2. Free guests, 0 JD custom-rate players, and coach slots contribute zero
   revenue while still consuming a court slot.
3. Unpaid amounts are not revenue. Revenue is money received. Show
   "profit" and "profit if all outstanding is collected" as two figures.

Cost allocation per 12.1: court cost per night split across that night's
sessions, water per session, assistant coach fee per day split the same way
as court cost. An unpaid coach is an accrued cost, marked as such, not cash
spent.

Test against the seeded two months of history. Revenue must reconcile
exactly to the sum of payment rows. Use the break-even table in 12.4 as a
sanity check on at least three sessions.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4. No CSV or PDF export.
- Before writing code, list the files you intend to create and wait for my
  go-ahead.
- Stop at the end of this phase and report. Do not start the next phase.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the file list.
```

---

## Phase 10, polish and release

```
Read BUILD-SPEC.md in full. It is authoritative. Phases 0 to 9 are complete.

Build Phase 10, as defined in section 20. Relevant sections: 16
(localization), 17 (design system), 23 (deployment and store submission),
14.14 (account deletion).

Work through this as an audit, screen by screen, and report findings before
fixing anything substantial.

1. Arabic pass. Open every screen in Arabic. Check text direction, that
   directional icons flip and non-directional ones do not, that the court
   board does NOT mirror, that phone numbers and emails stay LTR, and that
   plurals use i18next forms rather than an if statement.
2. State pass. Every screen has reachable loading, empty, and error states.
   Verify by forcing them, not by reading the code.
3. String parity. en.json and ar.json have identical key sets. Add a CI
   check that fails if they diverge.
4. WhatsApp affordance present on every screen listed in section 2 of the
   spec, including empty and error states.
5. Touch targets at 44x44 minimum. Court board names at 18pt minimum.
6. Sentry wired for crashes and unhandled rejections. No analytics SDK, no
   tracking, no advertising identifiers.
7. App icon and splash from the vector logo. Store screenshots in both
   languages for both phone sizes.
8. Verify account deletion is reachable in under three taps from the
   profile screen. This is an App Store rejection risk, guideline
   5.1.1(v).
9. Privacy policy URL, Play data safety form, permission usage strings in
   both languages per 23.3.
10. EAS build profiles, migrations applied to prod before submission.

Report the audit findings as a checklist with pass or fail per item before
you change anything.

STANDING RULES
- Section 3 is the decisions register. Never add anything listed in
  section 4. Polish does not mean new features.
- On a genuine contradiction, follow Appendix B.
- Definition of done is section 19.3.

Start with the audit.
```

---

## Between phases

After each phase report, before approving the next, check three things yourself rather than trusting the summary:

1. **Did it add anything from section 4?** Grep the diff for the words tournament, attendance, no-show, QR, export, chat.
2. **Are the Arabic strings real?** Agents will happily write `"reserve": "Reserve"` in `ar.json` to make the parity check pass.
3. **Do the tests test behaviour or existence?** A test that asserts a function was called is not a test.

If a phase comes back wrong, prefer re-running it in a fresh session with the correction stated up front over arguing with it in the crowded session that produced the mistake.
