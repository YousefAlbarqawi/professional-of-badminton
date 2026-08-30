# PROFESSIONAL OF BADMINTON — RESERVATION APP
# COMPLETE BUILD SPECIFICATION

**Document version:** 3.0
**Date:** 20 August 2026
**Supersedes:** v1.0 and v2.0 entirely
**Audience:** an autonomous coding agent, plus the human developer reviewing its output

---

## 0. HOW TO USE THIS DOCUMENT

This is the complete build contract. It is deliberately long, repetitive, and boring. Where a decision could go two ways, this document picks one. Do not invent alternatives. Do not "improve" a rule because it looks odd. Odd rules here are odd because a real badminton coach in Amman works that way.

**Rules for the implementing agent:**

1. Build in the phase order given in Section 20. Do not skip ahead. Each phase has a definition of done and acceptance criteria. Do not start phase N+1 until phase N's acceptance criteria pass.
2. Section 3 is the decisions register. If a question arises that Section 3 answers, that is the answer. If it is not in Section 3, check Section 21 (assumptions). If it is in neither, choose the simplest option that does not contradict anything, and append it to Section 21 in the repo copy of this file with a one line rationale.
3. Never add a feature that Section 4 lists as out of scope, even if it seems trivially easy or "obviously needed".
4. The database schema in Section 6 is authoritative. Do not add tables or columns without recording them in the repo copy of this document.
5. Money is never a float. Ever. See Section 5.3.
6. Every user-facing string goes through i18n. No hardcoded English or Arabic in components. See Section 16.
7. Write tests as you go, per Section 19. A phase is not done if its tests do not exist.

**What this document contains:**

| Section | Contents |
|---|---|
| 1 | Product overview and glossary |
| 2 | Technology stack, conventions, repository layout |
| 3 | Decisions register, every locked business decision |
| 4 | Out of scope, permanently |
| 5 | Core domain rules: time, money, capacity, states |
| 6 | Database schema, full DDL |
| 7 | Row level security policies |
| 8 | Server side functions and edge functions |
| 9 | Booking and cancellation engine |
| 10 | Payments and the post session review |
| 11 | Subscriptions and the credit ledger |
| 12 | Costs, revenue, and profit calculation |
| 13 | The matchmaking engine |
| 14 | Player app, screen by screen |
| 15 | Admin app, screen by screen |
| 16 | Localization and the string deck |
| 17 | Design system |
| 18 | Notifications |
| 19 | Testing strategy and acceptance criteria |
| 20 | Phased build plan |
| 21 | Assumptions register |
| 22 | Seed data |
| 23 | Deployment and store submission |
| 24 | Questions still outstanding for the client |

---

## 1. PRODUCT OVERVIEW AND GLOSSARY

### 1.1 What this is

A single tenant mobile application for one badminton academy in Amman, Jordan. It is published on the App Store and Google Play under the academy's own name and branding.

The academy runs open play sessions at two school gyms. Players currently message the coach on WhatsApp to ask whether there is a game tonight, who is coming, and where. The coach arranges who plays on which court in his head and reads it aloud at the venue. Money is collected in cash or by CliQ bank transfer, and tracked in his memory.

This app replaces the asking and the tracking. It does not replace the coach. He remains the only person who decides who plays where, who gets a subscription, and who owes him money.

### 1.2 The two sides

**Player side.** Sees sessions, reserves a spot, picks a payment method, joins a waiting list, sees his own subscription balance, reads announcements. Depending on a per account permission level, he sees either nothing about other attendees, or their skill levels, or their levels and names.

**Coach and admin side.** Everything else. Sessions, reservations, guests, payments, partial payments, debts, subscriptions, skill levels, the court board, announcements, and (coach only) reports.

### 1.3 Glossary

Use these terms consistently in code, comments, and UI copy.

| Term | Definition |
|---|---|
| **Session** | One bookable block at one venue on one date. Either 1.5 hours or 2.5 hours. This is the unit players reserve. |
| **Rotation** | One of the 4 (1.5h) or 6 to 7 (2.5h) rounds inside a session, where all attending players are redistributed across the courts. |
| **Court board** | The coach only screen showing every court and its four players, for every rotation. |
| **Template** | A recurring weekly definition, for example "Khalda, Saturday, 19:00, 90 minutes, 6 JD". Generates sessions. |
| **Instance** | A specific dated session generated from a template, or created ad hoc. |
| **Tier** | A player's skill rating. Nine values, A+ down to C-. Never called "rank" or "grade". |
| **Visibility level** | A per account permission, 0, 1, or 2, controlling what that player sees about other attendees. Never confuse with tier. |
| **Credit** | One prepaid session visit from a subscription package. |
| **Guest** | A person the coach adds by name only. No account. Not remembered after the session. |
| **CliQ** | Jordan's instant bank transfer system. Players send money and upload a screenshot. |
| **Review** | The post session workflow where the coach confirms who actually paid. |
| **Balance** | Money a player owes the coach. Never blocks anything. |
| **Custom rate** | A per player override of what that player pays per session. |

**Terminology warning.** The client, in conversation, uses the word "game" to mean an entire 1.5 hour session. This document never does. In this document a game does not exist as a concept. There are sessions and rotations.

### 1.4 Scale

This is a small system. Design accordingly and do not over engineer.

- Roughly 100 to 300 registered players in year one
- 12 sessions per week
- Maximum 16 players in a session
- 1 coach, 1 to 3 admins, 2 to 4 assistant coaches
- Peak concurrency: perhaps 30 people opening the app at once when a schedule is posted

There is no need for caching layers, message queues, microservices, or horizontal scaling. A single Supabase project handles this comfortably.

---

## 2. TECHNOLOGY STACK, CONVENTIONS, REPOSITORY LAYOUT

### 2.1 Stack

Fixed. Do not substitute.

| Concern | Choice | Notes |
|---|---|---|
| Framework | React Native via **Expo SDK 53+**, managed workflow with dev builds | Solo developer, needs EAS Build and EAS Update |
| Language | **TypeScript**, strict mode on | `strict: true`, `noUncheckedIndexedAccess: true` |
| Navigation | **React Navigation v7** | Native stack + bottom tabs |
| Server state | **TanStack Query v5** | All Supabase reads and writes |
| Client state | **Zustand** | Session language, theme, transient UI state only |
| Forms | **react-hook-form** + **zod** resolvers | One zod schema per form, shared with server validation where possible |
| Styling | **StyleSheet** with a typed theme object, consumed through a `useTheme()` hook | No Tailwind, no NativeWind, no styled-components |
| Backend | **Supabase**: Postgres 15+, Auth, Storage, Edge Functions | Single project, two environments |
| Auth | Supabase Auth, email and password, email confirmation on | No OAuth, no phone auth, no magic links |
| Push | **expo-notifications** with FCM (Android) and APNs (iOS) | Tokens stored server side |
| Dates | **date-fns** and **date-fns-tz** | Fixed zone Asia/Amman |
| i18n | **i18next** + **react-i18next** + **expo-localization** | See Section 16 |
| Lists | **@shopify/flash-list** | Any list that can exceed 20 rows |
| Drag and drop | **react-native-gesture-handler** + **react-native-reanimated** | Court board only |
| Images | **expo-image-picker**, **expo-image-manipulator** | CliQ screenshot capture and compression |
| Haptics | **expo-haptics** | 17.4's two triggers: booking success, court board swaps. Amendment to this table, phase 10 — see OPEN-ITEMS.md |
| Dates, picking one | **@react-native-community/datetimepicker** | A35's date fields: 15.6's create form, 15.9's grant form, and the extend sheet. Amendment to this table, phase 10 — see OPEN-ITEMS.md |
| Icons | **@expo/vector-icons** (Ionicons) | Tab bar icons on both navigators (14.0/15.0's bottom tabs, previously unspecified and rendering React Navigation's `MissingIcon` placeholder), the WhatsApp affordance's icon (D72), and elsewhere an icon reads better than a character. Ships inside every Expo project, no native linking. Amendment to this table — see OPEN-ITEMS.md |
| Testing | **Jest** + **@testing-library/react-native**; **Vitest** for pure logic packages if separated; **Maestro** for two e2e smoke flows | See Section 19 |
| Linting | ESLint + `@typescript-eslint`, Prettier | Enforced in CI |

### 2.2 Repository layout

```
/
├── CLAUDE.md                      # conventions, points at this file
├── BUILD-SPEC.md                  # this document
├── app.config.ts                  # Expo config, env driven
├── eas.json
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── app/                       # navigation tree
│   │   ├── RootNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   ├── PlayerNavigator.tsx
│   │   └── AdminNavigator.tsx
│   ├── screens/
│   │   ├── auth/
│   │   ├── player/
│   │   └── admin/
│   ├── components/
│   │   ├── primitives/            # Button, Text, Input, Card, Sheet, Badge
│   │   ├── domain/                # SessionCard, TierBadge, CourtTile, PaymentRow
│   │   └── states/                # Loading, Empty, ErrorState, PermissionDenied
│   ├── features/                  # one folder per domain area
│   │   ├── sessions/
│   │   ├── bookings/
│   │   ├── payments/
│   │   ├── subscriptions/
│   │   ├── matchmaking/
│   │   ├── players/
│   │   ├── announcements/
│   │   └── reports/
│   │       ├── api.ts             # supabase calls
│   │       ├── queries.ts         # TanStack query hooks
│   │       ├── mutations.ts
│   │       ├── schemas.ts         # zod
│   │       └── types.ts
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── money.ts               # fils helpers
│   │   ├── time.ts                # Amman timezone helpers
│   │   ├── tiers.ts
│   │   └── result.ts
│   ├── theme/
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── en.json
│   │   └── ar.json
│   └── types/
│       └── database.ts            # generated from Supabase
├── supabase/
│   ├── migrations/                # numbered SQL files
│   ├── functions/                 # edge functions
│   └── seed.sql
└── e2e/                           # maestro flows
```

### 2.3 Naming conventions

- Files: `PascalCase.tsx` for components, `camelCase.ts` for everything else
- Database: `snake_case` for tables and columns; tables plural (`bookings`, `session_instances`)
- Enums in Postgres, not string columns with check constraints, except where noted
- Booleans: `is_` or `has_` prefix (`is_locked`, `has_manual_edits`)
- Timestamps: `_at` suffix, always `timestamptz`
- Money columns: `_fils` suffix, always `integer`
- Query hooks: `useSessions`, `useSession(id)`, `useCreateBooking`
- Query keys: array form, `['sessions', { from, to }]`

### 2.4 CLAUDE.md

`CLAUDE.md` already exists at the repository root. It records the coding
conventions for this project and is loaded automatically at the start of
every session.

Do not create it, rewrite it, or move it. If a convention in it appears to
conflict with this specification, this specification wins, and you should
record the conflict per Appendix B rather than editing either file.

### 2.5 Environment variables

`.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_ENVIRONMENT=development
EXPO_PUBLIC_WHATSAPP_NUMBER=962792841696
EXPO_PUBLIC_SENTRY_DSN=
```

Service role key is never in the app. It exists only in Edge Function secrets.

Two Supabase projects: `pob-dev` and `pob-prod`. Never point a dev build at prod.

---

## 3. DECISIONS REGISTER

Every business decision the client has made. Numbered for reference. If the code disagrees with this table, the code is wrong.

### 3.1 Venues and schedule

| # | Decision |
|---|---|
| D1 | Two venues only: International Independent Schools (Khalda, 4 courts) and Al-Ra'ed Al-Arabi School (Shmeisani, 3 courts). |
| D2 | Dunes Club is removed entirely. It does not exist in the data model, the seed, or the UI. |
| D3 | Four players per court, always. Capacity = courts × 4. Khalda 16, Shmeisani 12. |
| D4 | All courts at a venue are rented for the whole night. Court count never varies by day. |
| D5 | Two session types only: `standard` (90 minutes, 6 JD, 4 rotations) and `extended` (150 minutes, 8 JD, 6 rotations, optionally 7). |
| D6 | Sessions generate automatically from weekly templates. The coach never has to open the app to create a week. |
| D7 | The coach can override any single dated instance: time, price, court count, or cancel it, without touching the template. |
| D8 | Personal training does not exist in the app. Not as a session, not as a blocked slot, not in reports. |
| D9 | Tournaments do not exist in the app. A tournament is an announcement only. |

**Khalda schedule**

| Weekday | Start | End | Type | Price |
|---|---|---|---|---|
| Saturday | 19:00 | 20:30 | standard | 6 JD |
| Saturday | 20:30 | 22:00 | standard | 6 JD |
| Monday | 18:30 | 21:00 | extended | 8 JD |
| Thursday | 19:00 | 20:30 | standard | 6 JD |
| Thursday | 20:30 | 22:00 | standard | 6 JD |
| Friday | 20:30 | 22:00 | standard | 6 JD |

**Shmeisani schedule**

| Weekday | Start | End | Type | Price |
|---|---|---|---|---|
| Sunday | 19:30 | 21:00 | standard | 6 JD |
| Sunday | 21:00 | 22:30 | standard | 6 JD |
| Tuesday | 20:30 | 23:00 | extended | 8 JD |
| Wednesday | 19:30 | 21:00 | standard | 6 JD |
| Wednesday | 21:00 | 22:30 | standard | 6 JD |
| Friday | 19:00 | 20:30 | standard | 6 JD |

### 3.2 Accounts and permissions

| # | Decision |
|---|---|
| D10 | Sign up is email and password only. No SMS, no phone auth, no OAuth, no magic links. |
| D11 | Sign up fields: first name, last name, email, phone number, password. Nothing else. All five required. |
| D12 | Email confirmation is required before a player can create a booking. He can log in and browse before confirming. |
| D13 | No coach approval for new accounts. Anyone who downloads the app can register and book. |
| D14 | Visibility level per account: 0 = counts only, 1 = tiers only, 2 = tiers and names. Default 0. |
| D15 | Only coach or admin changes a visibility level, up or down, any time, effective immediately. |
| D16 | Admins can do everything the coach can do **except view reports**. This includes deleting sessions, changing prices, granting subscriptions, changing visibility levels, and editing custom rates. |
| D17 | Assistant coaches have normal app accounts, flagged as coaches. The main coach adds them to a session and marks each paid or unpaid. |
| D18 | No player ever sees court assignments or rotations, at any visibility level. |
| D19 | No player ever sees his own tier or anyone else's, unless his visibility level is 1 or 2. |

### 3.3 Booking

| # | Decision |
|---|---|
| D20 | Booking window is a rolling 5 days from today, inclusive of today. |
| D21 | Reservations close 1 hour before session start. |
| D22 | The coach can add people manually at any time, including after the cutoff and during the session. |
| D23 | A player may cancel his own booking until 3 hours before start. |
| D24 | Inside the last 3 hours the player cannot cancel. Only the coach can remove him. |
| D25 | Cancellation more than 3 hours out: cash owes nothing, credit is returned, CliQ is refunded by the coach outside the app. |
| D26 | Cancellation inside 3 hours: cash owes nothing, credit is consumed and not returned, CliQ is not refunded. |
| D27 | Waiting list: free, no cap, no queue order, no auto promotion. Everyone is notified, first to press reserve wins. |
| D28 | The waiting list respects the 1 hour cutoff. If a spot opens 40 minutes before start, nobody can claim it in the app. Only the coach can fill it. |
| D29 | Overlapping bookings on the same day are allowed. No overlap prevention. |
| D30 | Capacity is hard. No overselling under any circumstance. |
| D31 | Cancelling a whole session sends **no** push notification to players. |
| D32 | When the coach cancels a session, CliQ money is assumed reversed outside the app. Credits are returned automatically. |
| D81 | 15.2's "Move to another session" (added phase 10, `admin_move_booking`, migration 0037): price does not re-resolve — `expected_fils` and `paid_fils` carry across unchanged. A credit follows him — the new booking reuses the old one's `credit_txn_id` rather than a refund-and-respend pair. Target capacity is hard, exactly as D30. |

### 3.4 Payments

| # | Decision |
|---|---|
| D33 | Three methods: cash on arrival, CliQ with a screenshot, subscription credit. |
| D34 | CliQ: attaching any image confirms the booking instantly. No approval step, no pending state, for every player, new or old. |
| D35 | No card payments, no gateway, no merchant account. |
| D36 | No OCR or automatic reading of screenshots. |
| D37 | After a session ends it enters review. The coach confirms, per row, whether cash was received and whether CliQ landed. |
| D38 | Partial payments are supported. The coach enters the amount actually received; the remainder becomes a balance entry. |
| D39 | The review window is 7 days from session end. Within it, everything is editable: payments, attendance list, additions, removals. After 7 days the session locks permanently. |
| D40 | Balances never block a booking. They are a record, not a gate. |
| D41 | Each player has a custom rate override in JD per session. Default is the session price. 0 is valid and expected. |

### 3.5 Adding people

| # | Decision |
|---|---|
| D42 | The coach can add a registered player by name search, without that player logging in. |
| D43 | If that player has an active subscription, one credit is deducted. If not, the booking is created as cash and marked paid, editable during review. |
| D44 | The coach can add a guest: name and tier only. |
| D45 | A guest booking can be paid (with an amount) or free (zero). Free guests fill empty spots and contribute no revenue. |
| D46 | Guests are **not** remembered. No autocomplete, no guest history, no merging. Typed fresh every time. |
| D47 | The coach and assistant coaches can be added as players. They occupy a court slot and pay nothing. |

### 3.6 Subscriptions

| # | Decision |
|---|---|
| D48 | Five packages. 8 visits / 40 JD / 1 month. 15 / 70 / 1 month. 20 / 90 / 2 months. 30 / 125 / 2 months. 40 / 160 / 3 months. |
| D49 | Subscriptions cannot be bought in the app. Only the coach or an admin grants one. |
| D50 | Money for a subscription is arranged outside the app, in instalments or in full. The app does not track subscription payment. |
| D51 | A player may hold several subscriptions at once, including duplicates of the same package. |
| D52 | One credit covers one session, standard or extended alike. |
| D53 | On an extended session the player owes the coach the cash difference at the venue. This is **not** recorded in the app. No balance entry, no reminder, no report line. |
| D54 | Expiry voids unused credits. Balance goes to zero. |
| D55 | Only the coach extends a subscription, manually, and only before it expires. |
| D56 | Credits are an append only ledger with a reason on every movement. Never a counter. |
| D57 | Migration of existing subscribers is manual: grant the full package, then deduct already used visits with an explicit adjustment action. |

### 3.7 Matchmaking

| # | Decision |
|---|---|
| D58 | Nine tiers exactly: A+, A, A-, B+, B, B-, C+, C, C-. A+ is strongest. |
| D59 | Rotations alternate two rules. Rule 1 on odd rotations, rule 2 on even rotations. |
| D60 | Rule 1: like with like. Minimise tier spread within a court. |
| D61 | Rule 2: mixed. Each team of two contains one stronger and one weaker player, and the two teams on a court are close in combined strength. |
| D62 | A 2.5 hour session alternates 1, 2, 1, 2, 1, 2, and a seventh rotation, if played, uses rule 1. |
| D63 | When a tier band does not divide into fours, the leftover player is pushed up or down at random, varied across rotations. |
| D64 | Avoid repeating a partnership within a 90 minute session. Repeats are acceptable within a 150 minute session. |
| D65 | Full manual control: drag, swap, lock a court, never-pair rules, always-pair rules. |
| D66 | Auto regeneration runs on every booking change until the coach makes his first manual edit on that session, then stops until he presses regenerate. |
| D67 | Under capacity is handled: ten players on three courts becomes two doubles and a singles. |
| D68 | The court board is coach and admin only. |

### 3.8 Other

| # | Decision |
|---|---|
| D69 | Announcements: one message to everyone, in whichever language the author types. Not a dual language form. Sends a push. |
| D70 | Push notifications fire for exactly two events: a waiting list spot opening, and a new announcement. |
| D71 | No in-app chat. All player to coach communication is WhatsApp, via `wa.me/962792841696`. |
| D72 | The WhatsApp action must be reachable from almost every screen, including empty and error states. |
| D73 | Reports are coach only. |
| D74 | Court cost is per night and splits evenly across that night's sessions. |
| D75 | Water is 1.25 JD per standard session and 2.5 JD per extended session. |
| D76 | An assistant coach costs 10 JD per day, not per session. |
| D77 | Arabic and English, switchable in app, full RTL. |
| D78 | Online only. No offline mode. |
| D79 | Mobile only. No web or tablet admin. |
| D80 | Single tenant. |

---

## 4. OUT OF SCOPE, PERMANENTLY

Do not build these. Do not leave stubs, dead code, feature flags, or database columns for them.

1. Tournaments as sessions
2. Personal training in any form
3. QR code check in
4. No show tracking
5. Attendance tracking as distinct from payment review
6. Score, win, or loss recording
7. In app chat or messaging
8. In app subscription purchase
9. Card, Visa, Apple Pay, or gateway payments
10. OCR of payment screenshots
11. Refunds processed inside the app
12. Guest memory, guest history, guest merging
13. Offline mode
14. Web admin, tablet layouts, responsive desktop
15. Recurring bookings for players
16. Overlap prevention between sessions
17. Late arrival or early departure handling in the lineup
18. Multi tenant or academy switching
19. CSV or PDF export
20. Player visible court assignments
21. SMS, anywhere, for any purpose
22. Social login
23. Player profile photos
24. Ratings or reviews of sessions
25. Referral or invite systems

---

## 5. CORE DOMAIN RULES

### 5.1 Time

**Everything is Asia/Amman.** Jordan is permanently UTC+3 with no daylight saving since 2022. Do not implement DST logic.

Rules:

- All `timestamptz` columns store UTC. All display and all business comparisons convert to Asia/Amman first.
- Session templates store a `start_time` as a `time` column plus a `weekday` integer (0 = Sunday through 6 = Saturday, matching Postgres `EXTRACT(DOW)`).
- A session instance stores `starts_at timestamptz` and `ends_at timestamptz`, computed at generation time in Amman local time.
- Never use `new Date()` directly in business logic. Use `src/lib/time.ts`:

```typescript
// src/lib/time.ts
export const TZ = 'Asia/Amman';
export function nowInAmman(): Date;
export function toAmman(d: Date | string): Date;
export function ammanStartOfDay(d: Date): Date;
export function bookingWindowEnd(now: Date): Date;      // now + 5 days, end of that day
export function reservationCutoff(startsAt: Date): Date; // startsAt - 1 hour
export function cancellationCutoff(startsAt: Date): Date;// startsAt - 3 hours
export function reviewDeadline(endsAt: Date): Date;      // endsAt + 7 days
export function formatSessionTime(d: Date, locale: 'en'|'ar'): string;
```

**Server side is the authority on time.** The client may compute cutoffs for display, but every write that depends on a deadline is validated again in Postgres. A phone with a wrong clock must not be able to book after the cutoff.

### 5.2 The booking window, precisely

The window is 5 days, inclusive of today, ending at 23:59:59 Amman on day 5.

Worked example. Now is Tuesday 20 August, 14:00 Amman.

- Visible: Tuesday 20, Wednesday 21, Thursday 22, Friday 23, Saturday 24
- Not visible: Sunday 25 onwards
- Tuesday's own extended session at 20:30 is bookable until 19:30
- A Tuesday session that started at 13:00 would be past its cutoff and shown as closed, not hidden

Sessions in the past are hidden from the player schedule entirely. The player's "my bookings" list shows past bookings for 30 days, then hides them.

### 5.3 Money

**All money is stored as integer fils.** 1 JD = 1000 fils. Jordan quotes three decimal places.

| Value | Fils |
|---|---|
| 6 JD | 6000 |
| 8 JD | 8000 |
| 1.25 JD | 1250 |
| 2.5 JD | 2500 |
| 47.5 JD | 47500 |
| 23.75 JD | 23750 |
| 4.166 JD (a 30/125 credit) | 4167 with banker's rounding at the point of report aggregation |

`src/lib/money.ts`:

```typescript
export type Fils = number & { readonly __brand: 'Fils' };
export function fils(jd: number): Fils;
export function toJD(f: Fils): number;
export function formatMoney(f: Fils, locale: 'en'|'ar'): string; // "6.000 JD" / "٦٫٠٠٠ د.أ"
export function splitEvenly(total: Fils, parts: number): Fils[]; // remainder to the first part
```

`splitEvenly` matters. 47500 fils across two sessions is 23750 each, clean. 47500 across three would be 15834, 15833, 15833. The remainder always goes to the earliest session so the total always reconciles exactly.

**Never** use JavaScript floats for money arithmetic. Never store money as `numeric` and read it into a JS number without conversion.

### 5.4 Capacity

```
capacity = court_count × 4
```

Capacity is enforced in the database with a constraint plus a transaction, not in application code. Two players tapping reserve on the last spot at the same moment must produce exactly one booking and one clear error.

Implementation: the booking insert goes through a Postgres function that locks the session row (`SELECT ... FOR UPDATE`) before counting active bookings. See Section 8.2.

Cancelled bookings do not count toward capacity. Guest bookings do. Coach and assistant coach bookings do.

### 5.5 Session state machine

```
SCHEDULED
   │  (starts_at reached)
   ▼
IN_PROGRESS
   │  (ends_at reached)
   ▼
PENDING_REVIEW ◄──────┐
   │  coach confirms  │ coach re-opens, within 7 days
   ▼                  │
CONFIRMED ────────────┘
   │  (ends_at + 7 days)
   ▼
LOCKED

SCHEDULED or IN_PROGRESS ──(coach cancels)──► CANCELLED
```

- `IN_PROGRESS` and `PENDING_REVIEW` are derived from timestamps by a scheduled job, not by client polling
- `CONFIRMED` means the coach has pressed confirm at least once. It is reversible for 7 days.
- `LOCKED` is permanent. No edits, ever. Set by a daily job.
- `CANCELLED` sessions keep their bookings for the record, all marked `CANCELLED_BY_ADMIN`

### 5.6 Booking state machine

```
CONFIRMED
   ├──(player cancels, >3h before)──► CANCELLED_BY_PLAYER
   ├──(coach removes, any time)─────► CANCELLED_BY_ADMIN
   └──(coach confirms in review)────► SETTLED
```

There is no `PENDING`. There is no `ATTENDED`. `SETTLED` means the coach has reviewed this row's payment; it says nothing about whether the person physically turned up, because attendance is explicitly not tracked.

---

## 6. DATABASE SCHEMA

Postgres 15 on Supabase. Migration files numbered `0001_`, `0002_`, and so on, in `supabase/migrations/`.

### 6.1 Enums

```sql
CREATE TYPE user_role         AS ENUM ('player', 'assistant_coach', 'admin', 'coach');
CREATE TYPE visibility_level  AS ENUM ('level_0', 'level_1', 'level_2');
CREATE TYPE tier              AS ENUM ('C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+');
CREATE TYPE session_type      AS ENUM ('standard', 'extended');
CREATE TYPE session_status    AS ENUM ('scheduled','in_progress','pending_review','confirmed','locked','cancelled');
CREATE TYPE booking_status    AS ENUM ('confirmed','cancelled_by_player','cancelled_by_admin','settled');
CREATE TYPE booking_source    AS ENUM ('self','admin_added','waitlist_claim');
CREATE TYPE attendee_kind     AS ENUM ('player','guest','coach');
CREATE TYPE payment_method    AS ENUM ('cash','cliq','credit','free');
CREATE TYPE payment_status    AS ENUM ('unpaid','paid','partial','waived');
CREATE TYPE credit_reason     AS ENUM ('grant','booking','booking_refund','expiry','manual_adjustment','session_cancelled');
CREATE TYPE rotation_rule     AS ENUM ('rule_1_similar','rule_2_mixed');
CREATE TYPE pairing_rule_kind AS ENUM ('never_pair','always_pair');
```

**Tier ordering matters.** The enum is declared weakest first so Postgres comparison operators work naturally: `'A+'::tier > 'B'::tier` is true. In TypeScript, keep a parallel ordered array and a numeric map (`C- = 1 ... A+ = 9`).

### 6.2 Tables

```sql
-- ─────────────────────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name            text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 50),
  last_name             text NOT NULL CHECK (length(trim(last_name))  BETWEEN 1 AND 50),
  phone                 text NOT NULL CHECK (phone ~ '^\+?[0-9]{9,15}$'),
  role                  user_role        NOT NULL DEFAULT 'player',
  visibility            visibility_level NOT NULL DEFAULT 'level_0',
  tier                  tier,                      -- null until the coach rates him
  custom_rate_standard_fils integer CHECK (custom_rate_standard_fils >= 0),
  custom_rate_extended_fils integer CHECK (custom_rate_extended_fils >= 0),
  preferred_locale      text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar','en')),
  is_active             boolean NOT NULL DEFAULT true,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_role      ON profiles(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_name_trgm ON profiles USING gin ((first_name||' '||last_name) gin_trgm_ops);

-- name search for the coach's "add player" flow needs pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─────────────────────────────────────────────────────────
-- VENUES
-- ─────────────────────────────────────────────────────────
CREATE TABLE venues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  area_en       text NOT NULL,
  area_ar       text NOT NULL,
  court_count   integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  google_maps_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────
-- COST RATES  (effective dated, never overwritten)
-- ─────────────────────────────────────────────────────────
CREATE TABLE venue_night_costs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id           uuid NOT NULL REFERENCES venues(id),
  weekday            integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  court_cost_fils    integer NOT NULL CHECK (court_cost_fils >= 0),
  effective_from     date NOT NULL,
  effective_to       date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX idx_night_cost_active
  ON venue_night_costs(venue_id, weekday, effective_from);

CREATE TABLE consumable_costs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type       session_type NOT NULL,
  water_cost_fils    integer NOT NULL CHECK (water_cost_fils >= 0),
  effective_from     date NOT NULL,
  effective_to       date,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_fee_rates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_fee_fils     integer NOT NULL CHECK (daily_fee_fils >= 0),
  effective_from     date NOT NULL,
  effective_to       date,
  created_at         timestamptz NOT NULL DEFAULT now()
);
```

Effective dating is not optional. Court rents and prices will change, and without it every historical profit report silently rewrites itself when a rate is edited.

```sql
-- ─────────────────────────────────────────────────────────
-- SESSION TEMPLATES AND INSTANCES
-- ─────────────────────────────────────────────────────────
CREATE TABLE session_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid NOT NULL REFERENCES venues(id),
  weekday        integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time     time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes IN (90, 150)),
  session_type   session_type NOT NULL,
  price_fils     integer NOT NULL CHECK (price_fils >= 0),
  court_count    integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  rotation_count integer NOT NULL CHECK (rotation_count BETWEEN 1 AND 10),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, weekday, start_time)
);

CREATE TABLE session_instances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid REFERENCES session_templates(id),   -- null = ad hoc
  venue_id          uuid NOT NULL REFERENCES venues(id),
  session_date      date NOT NULL,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  session_type      session_type NOT NULL,
  price_fils        integer NOT NULL CHECK (price_fils >= 0),
  court_count       integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  rotation_count    integer NOT NULL CHECK (rotation_count BETWEEN 1 AND 10),
  capacity          integer GENERATED ALWAYS AS (court_count * 4) STORED,
  status            session_status NOT NULL DEFAULT 'scheduled',
  has_manual_lineup boolean NOT NULL DEFAULT false,
  assistant_coach_count integer NOT NULL DEFAULT 0,
  -- cost snapshot, written at generation, recomputed only while status='scheduled'
  court_cost_share_fils integer NOT NULL DEFAULT 0,
  water_cost_fils       integer NOT NULL DEFAULT 0,
  coach_fee_share_fils  integer NOT NULL DEFAULT 0,
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES profiles(id),
  cancellation_note text,
  reviewed_at       timestamptz,
  reviewed_by       uuid REFERENCES profiles(id),
  locked_at         timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (venue_id, starts_at)
);
CREATE INDEX idx_instances_date   ON session_instances(session_date);
CREATE INDEX idx_instances_status ON session_instances(status);
CREATE INDEX idx_instances_upcoming ON session_instances(starts_at)
  WHERE status IN ('scheduled','in_progress');
```

The cost snapshot lives on the instance because the night cost must be divided across that night's sessions, and that division depends on how many sessions actually ran. It is recomputed whenever a sibling session on the same night is cancelled or added, but only while the session is still `scheduled`.

```sql
-- ─────────────────────────────────────────────────────────
-- BOOKINGS
-- ─────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  attendee_kind      attendee_kind NOT NULL,
  player_id          uuid REFERENCES profiles(id),   -- null for guests
  guest_name         text,                           -- null for players
  guest_tier         tier,
  tier_snapshot      tier,                           -- tier at booking time, for the engine
  status             booking_status NOT NULL DEFAULT 'confirmed',
  source             booking_source NOT NULL DEFAULT 'self',
  payment_method     payment_method NOT NULL,
  payment_status     payment_status NOT NULL DEFAULT 'unpaid',
  expected_fils      integer NOT NULL CHECK (expected_fils >= 0),  -- price snapshot
  paid_fils          integer NOT NULL DEFAULT 0 CHECK (paid_fils >= 0),
  credit_txn_id      uuid,                           -- set when payment_method='credit'
  is_coach_slot      boolean NOT NULL DEFAULT false,
  booked_at          timestamptz NOT NULL DEFAULT now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid REFERENCES profiles(id),
  settled_at         timestamptz,
  created_by         uuid REFERENCES profiles(id),
  note               text,
  CHECK (
    (attendee_kind = 'guest' AND guest_name IS NOT NULL AND player_id IS NULL)
    OR (attendee_kind <> 'guest' AND player_id IS NOT NULL AND guest_name IS NULL)
  ),
  CHECK (paid_fils <= expected_fils OR expected_fils = 0)
);
CREATE UNIQUE INDEX idx_one_active_booking_per_player
  ON bookings(session_id, player_id)
  WHERE status = 'confirmed' AND player_id IS NOT NULL;
CREATE INDEX idx_bookings_session ON bookings(session_id) WHERE status = 'confirmed';
CREATE INDEX idx_bookings_player  ON bookings(player_id, booked_at DESC);

-- ─────────────────────────────────────────────────────────
-- WAITLIST
-- ─────────────────────────────────────────────────────────
CREATE TABLE waitlist_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  left_at      timestamptz,
  notified_at  timestamptz,
  UNIQUE (session_id, player_id)
);
CREATE INDEX idx_waitlist_active ON waitlist_entries(session_id) WHERE left_at IS NULL;

-- ─────────────────────────────────────────────────────────
-- PAYMENT PROOFS
-- ─────────────────────────────────────────────────────────
CREATE TABLE payment_proofs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_size_bytes integer NOT NULL CHECK (file_size_bytes <= 10485760),
  mime_type    text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  purge_after  date NOT NULL DEFAULT (current_date + interval '365 days')
);

-- ─────────────────────────────────────────────────────────
-- BALANCES
-- ─────────────────────────────────────────────────────────
CREATE TABLE balance_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES session_instances(id) ON DELETE SET NULL,
  amount_fils  integer NOT NULL,   -- positive = owed to coach, negative = settlement
  note         text,
  created_by   uuid NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_balance_player ON balance_entries(player_id, created_at DESC);

-- ─────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────
CREATE TABLE packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en           text NOT NULL,
  name_ar           text NOT NULL,
  visit_count       integer NOT NULL CHECK (visit_count > 0),
  price_fils        integer NOT NULL CHECK (price_fils >= 0),
  duration_months   integer NOT NULL CHECK (duration_months > 0),
  per_visit_fils    integer GENERATED ALWAYS AS (price_fils / visit_count) STORED,
  display_order     integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true
);

CREATE TABLE player_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id        uuid NOT NULL REFERENCES packages(id),
  granted_visits    integer NOT NULL CHECK (granted_visits > 0),
  per_visit_fils    integer NOT NULL,          -- snapshot of package rate
  starts_on         date NOT NULL,
  expires_on        date NOT NULL,
  is_voided         boolean NOT NULL DEFAULT false,
  granted_by        uuid NOT NULL REFERENCES profiles(id),
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on > starts_on)
);
CREATE INDEX idx_subs_player_active ON player_subscriptions(player_id, expires_on)
  WHERE is_voided = false;

CREATE TABLE credit_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES player_subscriptions(id) ON DELETE CASCADE,
  player_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta             integer NOT NULL CHECK (delta <> 0),   -- +n grant, -1 booking, +1 refund
  reason            credit_reason NOT NULL,
  booking_id        uuid REFERENCES bookings(id) ON DELETE SET NULL,
  note              text,
  created_by        uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_txn_sub ON credit_transactions(subscription_id);
CREATE INDEX idx_credit_txn_player ON credit_transactions(player_id, created_at DESC);

ALTER TABLE bookings
  ADD CONSTRAINT fk_booking_credit_txn
  FOREIGN KEY (credit_txn_id) REFERENCES credit_transactions(id) ON DELETE SET NULL;
```

The credit balance of a subscription is always `SELECT COALESCE(SUM(delta),0) FROM credit_transactions WHERE subscription_id = $1`. There is no cached counter column. If a balance ever looks wrong, the ledger explains it.

```sql
-- ─────────────────────────────────────────────────────────
-- ASSISTANT COACHES ON A SESSION
-- ─────────────────────────────────────────────────────────
CREATE TABLE session_coaches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  coach_id       uuid NOT NULL REFERENCES profiles(id),
  night_key      text NOT NULL,       -- venue_id || session_date, for per-day fee dedupe
  is_paid        boolean NOT NULL DEFAULT false,
  fee_share_fils integer NOT NULL DEFAULT 0,
  paid_at        timestamptz,
  added_by       uuid NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, coach_id)
);

-- ─────────────────────────────────────────────────────────
-- LINEUPS
-- ─────────────────────────────────────────────────────────
CREATE TABLE rotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  rotation_index integer NOT NULL CHECK (rotation_index BETWEEN 1 AND 10),
  rule          rotation_rule NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, rotation_index)
);

CREATE TABLE court_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id   uuid NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
  court_number  integer NOT NULL CHECK (court_number >= 1),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team          integer NOT NULL CHECK (team IN (1,2)),
  is_locked     boolean NOT NULL DEFAULT false,
  UNIQUE (rotation_id, booking_id)
);
CREATE INDEX idx_assignments_rotation ON court_assignments(rotation_id, court_number);

CREATE TABLE rotation_sitouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id   uuid NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  UNIQUE (rotation_id, booking_id)
);

CREATE TABLE locked_courts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  court_number  integer NOT NULL,
  booking_ids   uuid[] NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, court_number)
);

CREATE TABLE pairing_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          pairing_rule_kind NOT NULL,
  player_a_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_b_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (player_a_id <> player_b_id)
);
CREATE UNIQUE INDEX idx_pairing_unique
  ON pairing_rules (LEAST(player_a_id,player_b_id), GREATEST(player_a_id,player_b_id));

-- ─────────────────────────────────────────────────────────
-- ANNOUNCEMENTS, DEVICES, AUDIT
-- ─────────────────────────────────────────────────────────
CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body        text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  language    text NOT NULL CHECK (language IN ('ar','en')),
  author_id   uuid NOT NULL REFERENCES profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  push_sent_at timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false
);

CREATE TABLE device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  platform    text NOT NULL CHECK (platform IN ('ios','android')),
  locale      text NOT NULL DEFAULT 'ar',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES profiles(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id, created_at DESC);
```

Audit rows are written by triggers on `bookings`, `player_subscriptions`, `credit_transactions`, `balance_entries`, `session_instances`, and `profiles` (role, visibility, tier, custom rate changes only).

```sql
-- ─────────────────────────────────────────────────────────
-- THE PUSH OUTBOX
-- Added by the phase 8 agent under the section 0 rule 4 procedure. See A66.
--
-- Section 8.4 step 4 says to "insert a push job row for each, then call the
-- send-push edge function", and defines no such table. These are it.
-- ─────────────────────────────────────────────────────────
CREATE TYPE push_job_kind AS ENUM ('waitlist_spot', 'announcement');

CREATE TABLE push_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            push_job_kind NOT NULL,
  session_id      uuid REFERENCES session_instances(id) ON DELETE CASCADE,
  announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE,
  recipient_ids   uuid[],          -- null = every registered device
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  sent_at         timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  device_count    integer NOT NULL DEFAULT 0,
  last_error      text,
  CHECK (
    (kind = 'waitlist_spot' AND session_id IS NOT NULL AND announcement_id IS NULL)
    OR (kind = 'announcement' AND announcement_id IS NOT NULL AND session_id IS NULL)
  )
);
CREATE INDEX idx_push_jobs_pending ON push_jobs(created_at) WHERE sent_at IS NULL;

CREATE TABLE push_deliveries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     uuid NOT NULL REFERENCES push_jobs(id) ON DELETE CASCADE,
  token      text NOT NULL,
  ticket_id  text,
  status     text NOT NULL CHECK (status IN ('sent','failed','settled')),
  error_code text,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz
);
CREATE INDEX idx_push_deliveries_unchecked ON push_deliveries(sent_at)
  WHERE checked_at IS NULL AND ticket_id IS NOT NULL;
CREATE INDEX idx_push_deliveries_job ON push_deliveries(job_id);
```

`push_job_kind` has two values because D70 allows two triggers. A third kind of
notification cannot be enqueued, so it cannot be sent.

Both tables are service role only: RLS on with no policies, and the grants
revoked as well. A waitlist job carries the ids of everyone on a waiting list,
which is nobody else's business.

### 6.3 Views

```sql
CREATE VIEW v_player_credit_balance AS
SELECT s.player_id,
       s.id AS subscription_id,
       s.expires_on,
       s.per_visit_fils,
       COALESCE(SUM(t.delta), 0) AS remaining
FROM player_subscriptions s
LEFT JOIN credit_transactions t ON t.subscription_id = s.id
WHERE s.is_voided = false
GROUP BY s.id;

CREATE VIEW v_player_total_balance AS
SELECT player_id, COALESCE(SUM(amount_fils),0) AS owed_fils
FROM balance_entries GROUP BY player_id;

CREATE VIEW v_session_occupancy AS
SELECT si.id AS session_id,
       si.capacity,
       COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS taken,
       si.capacity - COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS remaining
FROM session_instances si
LEFT JOIN bookings b ON b.session_id = si.id
GROUP BY si.id;
```

---

## 7. ROW LEVEL SECURITY

Visibility levels are a security boundary, not a UI preference. A level 0 player must not be able to obtain another player's name from the API by any means, including crafting his own query with the anon key.

Enable RLS on every table. Default deny.

### 7.1 Helper functions

```sql
CREATE OR REPLACE FUNCTION auth_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_role() IN ('admin','coach');
$$;

CREATE OR REPLACE FUNCTION is_coach() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT auth_role() = 'coach';
$$;

CREATE OR REPLACE FUNCTION auth_visibility() RETURNS visibility_level
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT visibility FROM profiles WHERE id = auth.uid();
$$;
```

### 7.2 The visibility problem, solved properly

A player must be able to see *how many* people booked a session regardless of level, but names and tiers only at the right level. Row filtering alone cannot express "you may see this row but only two of its columns".

**Solution: players never select from `bookings` directly.** They call a security definer function that returns exactly what their level permits.

```sql
CREATE OR REPLACE FUNCTION get_session_attendees(p_session_id uuid)
RETURNS TABLE (
  booking_id uuid,
  display_name text,
  tier tier,
  is_self boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_level visibility_level;
  v_staff boolean;
BEGIN
  SELECT auth_visibility(), is_staff() INTO v_level, v_staff;

  IF v_staff THEN
    RETURN QUERY
      SELECT b.id,
             COALESCE(p.first_name||' '||p.last_name, b.guest_name),
             COALESCE(b.tier_snapshot, b.guest_tier),
             (b.player_id = auth.uid())
      FROM bookings b
      LEFT JOIN profiles p ON p.id = b.player_id
      WHERE b.session_id = p_session_id AND b.status = 'confirmed'
      ORDER BY b.booked_at;
    RETURN;
  END IF;

  IF v_level = 'level_2' THEN
    RETURN QUERY
      SELECT b.id,
             COALESCE(p.first_name||' '||p.last_name, b.guest_name),
             COALESCE(b.tier_snapshot, b.guest_tier),
             (b.player_id = auth.uid())
      FROM bookings b
      LEFT JOIN profiles p ON p.id = b.player_id
      WHERE b.session_id = p_session_id AND b.status = 'confirmed'
      ORDER BY b.booked_at;

  ELSIF v_level = 'level_1' THEN
    RETURN QUERY
      SELECT b.id,
             NULL::text,
             COALESCE(b.tier_snapshot, b.guest_tier),
             (b.player_id = auth.uid())
      FROM bookings b
      WHERE b.session_id = p_session_id AND b.status = 'confirmed'
      ORDER BY b.booked_at;

  ELSE
    -- level_0: nothing but the caller's own row
    RETURN QUERY
      SELECT b.id, NULL::text, NULL::tier, true
      FROM bookings b
      WHERE b.session_id = p_session_id
        AND b.status = 'confirmed'
        AND b.player_id = auth.uid();
  END IF;
END;
$$;
```

Occupancy counts come from `v_session_occupancy`, which exposes only integers and is readable by any authenticated user.

### 7.3 Policies

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_self ON profiles FOR SELECT
  USING (id = auth.uid());
CREATE POLICY profiles_select_staff ON profiles FOR SELECT
  USING (is_staff());
CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_staff ON profiles FOR UPDATE
  USING (is_staff());
```

A player updating his own profile must not be able to change `role`, `visibility`, `tier`, or either custom rate. Enforce with a trigger, because a `WITH CHECK` cannot compare to the old row:

```sql
CREATE OR REPLACE FUNCTION guard_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT is_staff() THEN
    IF NEW.role <> OLD.role
       OR NEW.visibility <> OLD.visibility
       OR NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.custom_rate_standard_fils IS DISTINCT FROM OLD.custom_rate_standard_fils
       OR NEW.custom_rate_extended_fils IS DISTINCT FROM OLD.custom_rate_extended_fils
    THEN
      RAISE EXCEPTION 'not_authorized_to_change_privileged_fields';
    END IF;
  END IF;
  IF NEW.role = 'coach' AND OLD.role <> 'coach' AND NOT is_coach() THEN
    RAISE EXCEPTION 'only_coach_can_create_coach';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_profile BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_fields();
```

Remaining tables, summarised. Write each one out in the migration.

| Table | Player SELECT | Player INSERT/UPDATE | Staff |
|---|---|---|---|
| `venues` | all active | none | full |
| `session_templates` | none | none | full |
| `session_instances` | rows within the booking window and not cancelled | none | full |
| `bookings` | only rows where `player_id = auth.uid()` | insert via RPC only | full |
| `waitlist_entries` | own rows | insert and delete own rows, subject to RPC | full |
| `payment_proofs` | own booking's proofs | insert for own booking | full |
| `balance_entries` | **none** (see assumption A4) | none | full |
| `packages` | all active | none | full |
| `player_subscriptions` | own rows | none | full |
| `credit_transactions` | own rows | none | full |
| `session_coaches` | none | none | full |
| `rotations`, `court_assignments`, `rotation_sitouts`, `locked_courts`, `pairing_rules` | **none** | none | full |
| `announcements` | all not deleted | none | full |
| `device_tokens` | own rows | insert and update own rows | full |
| `push_jobs`, `push_deliveries` | **none** | none | **none** (service role only; see A66) |
| `audit_log` | none | none | coach only |
| Report views | none | none | coach only |

Storage bucket `payment-proofs` is private. Policy: a player may `INSERT` an object whose path starts with his own user id. Only staff may `SELECT`. Nobody may `UPDATE` or `DELETE` except the purge job running with the service role.

---

## 8. SERVER SIDE FUNCTIONS

Anything that must be atomic, or that a client must not be trusted to compute, lives in Postgres. The app calls these with `supabase.rpc()`.

### 8.1 Session generation

```sql
CREATE OR REPLACE FUNCTION generate_sessions(p_days_ahead integer DEFAULT 21)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
```

Behaviour:

1. For each active template, for each date from today to today + `p_days_ahead`, where `EXTRACT(DOW FROM date) = template.weekday`
2. Insert a `session_instances` row if one does not already exist for that `(venue_id, starts_at)`
3. Compute `starts_at` and `ends_at` in Asia/Amman, then store as `timestamptz`
4. Copy price, court count, rotation count, and session type from the template
5. Call `recompute_night_costs(venue_id, session_date)` for each affected night
6. Return the number of sessions created

Runs nightly at 03:00 Amman via `pg_cron`, and once manually after seeding. Generating 21 days ahead while the booking window is 5 days is deliberate: it gives the coach room to edit or cancel future instances in advance.

### 8.2 Booking creation, the critical path

```sql
CREATE OR REPLACE FUNCTION create_booking(
  p_session_id uuid,
  p_payment_method payment_method
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_session session_instances;
  v_taken integer;
  v_player profiles;
  v_expected integer;
  v_sub_id uuid;
  v_booking_id uuid;
  v_txn_id uuid;
BEGIN
  SELECT * INTO v_session FROM session_instances
    WHERE id = p_session_id FOR UPDATE;              -- serialise on the session row

  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'session_not_open'; END IF;
  IF now() > v_session.starts_at - interval '1 hour' THEN
    RAISE EXCEPTION 'booking_window_closed'; END IF;
  IF v_session.session_date > (current_date + interval '4 days') THEN
    RAISE EXCEPTION 'outside_booking_window'; END IF;

  SELECT * INTO v_player FROM profiles WHERE id = auth.uid();
  IF v_player.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'account_deleted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users
                 WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'email_not_confirmed'; END IF;

  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION 'session_full'; END IF;

  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_session_id
               AND player_id = auth.uid() AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked'; END IF;

  v_expected := resolve_price(v_player.id, v_session.session_type, v_session.price_fils);

  IF p_payment_method = 'credit' THEN
    v_sub_id := pick_subscription(auth.uid());
    IF v_sub_id IS NULL THEN RAISE EXCEPTION 'no_credits_available'; END IF;
  END IF;

  INSERT INTO bookings (session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, source, created_by)
  VALUES (p_session_id, 'player', auth.uid(), v_player.tier,
          p_payment_method,
          CASE WHEN p_payment_method = 'credit' THEN 'paid' ELSE 'unpaid' END,
          CASE WHEN p_payment_method = 'credit' THEN 0 ELSE v_expected END,
          'self', auth.uid())
  RETURNING id INTO v_booking_id;

  IF p_payment_method = 'credit' THEN
    INSERT INTO credit_transactions (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES (v_sub_id, auth.uid(), -1, 'booking', v_booking_id, auth.uid())
    RETURNING id INTO v_txn_id;
    UPDATE bookings SET credit_txn_id = v_txn_id WHERE id = v_booking_id;
  END IF;

  DELETE FROM waitlist_entries WHERE session_id = p_session_id AND player_id = auth.uid();
  PERFORM mark_lineup_stale(p_session_id);
  RETURN v_booking_id;
END; $$;
```

**`resolve_price(player, type, session_price)`**

```
if type = 'standard' and custom_rate_standard_fils is not null
    return custom_rate_standard_fils
if type = 'extended' and custom_rate_extended_fils is not null
    return custom_rate_extended_fils
return session_price
```

**`pick_subscription(player)`** returns the subscription to deduct from. Order:

1. Only subscriptions where `is_voided = false`, `expires_on >= current_date`, and remaining balance > 0
2. Sort by `expires_on` ascending, so the credit closest to dying is used first
3. Tie break on `created_at` ascending
4. Return null if none

### 8.3 Cancellation

```sql
CREATE OR REPLACE FUNCTION cancel_own_booking(p_booking_id uuid) RETURNS void
```

1. Load the booking and its session, `FOR UPDATE`
2. Reject if `booking.player_id <> auth.uid()` → `not_your_booking`
3. Reject if status is not `confirmed` → `already_cancelled`
4. Reject if `now() > starts_at - interval '3 hours'` → `cancellation_window_closed`
5. Set status `cancelled_by_player`, `cancelled_at = now()`
6. If `payment_method = 'credit'`, insert `+1` credit transaction with reason `booking_refund`, against the same subscription, **even if that subscription has since expired** (see assumption A2)
7. Call `notify_waitlist(session_id)`
8. Call `mark_lineup_stale(session_id)`

```sql
CREATE OR REPLACE FUNCTION admin_remove_booking(p_booking_id uuid, p_return_credit boolean)
RETURNS void
```

Staff only. Works at any time, before or after the cutoff, until the session locks. `p_return_credit` defaults to `false` when inside the 3 hour window, `true` when outside it, but the caller may override either way, because the coach is allowed to make exceptions.

### 8.4 Waitlist notification

```sql
CREATE OR REPLACE FUNCTION notify_waitlist(p_session_id uuid) RETURNS void
```

1. Load the session. If `now() > starts_at - interval '1 hour'`, return immediately and do nothing. This is decision D28: a spot opening inside the last hour is invisible to the waiting list.
2. If occupancy is still at capacity, return
3. Select all `waitlist_entries` with `left_at IS NULL`
4. Insert a push job row for each, then call the send-push edge function
5. Stamp `notified_at`

There is no reservation, no hold, and no ordering. The push says a spot opened. The first person to call `create_booking` gets it and everyone else gets `session_full`, which the UI must present gently.

### 8.5 Review and settlement

```sql
CREATE OR REPLACE FUNCTION record_payment(
  p_booking_id uuid, p_paid_fils integer, p_method payment_method, p_note text
) RETURNS void
```

Staff only. Rules:

- Reject if the session is `locked`
- `paid_fils = expected_fils` → `payment_status = 'paid'`
- `0 < paid_fils < expected_fils` → `payment_status = 'partial'`, and insert a `balance_entries` row for the difference, replacing any prior balance row for the same booking
- `paid_fils = 0` and `expected_fils > 0` → `payment_status = 'unpaid'`, and insert a balance entry for the whole amount
- `expected_fils = 0` → `payment_status = 'waived'`, never a balance entry
- Every call rewrites, never duplicates, the balance entry linked to that booking

```sql
CREATE OR REPLACE FUNCTION confirm_session_review(p_session_id uuid) RETURNS void
```

Staff only. Sets every `confirmed` booking on the session to `settled`, stamps `reviewed_at` and `reviewed_by`, and moves the session to `confirmed`. Reversible: `reopen_session_review` moves it back to `pending_review`, allowed until `ends_at + 7 days`.

### 8.6 Scheduled jobs (`pg_cron`)

| Schedule (Amman) | Job |
|---|---|
| Every 5 minutes | Advance sessions past `starts_at` to `in_progress`, past `ends_at` to `pending_review` |
| Daily 03:00 | `generate_sessions(21)` |
| Daily 03:10 | Lock sessions where `ends_at < now() - interval '7 days'` |
| Daily 03:20 | Void subscriptions where `expires_on < current_date`, writing an `expiry` credit transaction that zeroes the remaining balance |
| Daily 04:00 | Purge `payment_proofs` past `purge_after`, deleting storage objects first |

### 8.7 Edge functions

| Function | Purpose |
|---|---|
| `send-push` | Takes a list of player ids and a payload, looks up device tokens, sends via Expo push API, prunes dead tokens |
| `delete-account` | Called by the player. Anonymises the profile, revokes tokens, deletes the auth user. See A1. |

---

## 9. BOOKING AND CANCELLATION, THE COMPLETE RULE SET

Every rule below is enforced server side. Client side checks exist only to avoid pointless round trips and to show the right button.

### 9.1 Can this player book this session?

Evaluate in this order and return the first failure.

| # | Condition | Error code | Player-facing message key |
|---|---|---|---|
| 1 | Session exists | `session_not_found` | `error.sessionNotFound` |
| 2 | Session status is `scheduled` | `session_not_open` | `error.sessionCancelled` |
| 3 | Session date within 5 day window | `outside_booking_window` | `error.tooFarAhead` |
| 4 | Now is before `starts_at - 1 hour` | `booking_window_closed` | `error.bookingClosed` |
| 5 | Email confirmed | `email_not_confirmed` | `error.confirmEmailFirst` |
| 6 | Account not deleted | `account_deleted` | `error.accountDeleted` |
| 7 | Not already booked in this session | `already_booked` | `error.alreadyBooked` |
| 8 | Occupancy < capacity | `session_full` | `error.sessionFull` |
| 9 | If paying by credit, a usable subscription exists | `no_credits_available` | `error.noCredits` |

Note what is **not** on the list: an outstanding balance, a previous no show, an overlapping booking on the same evening, or a coach approval. None of those block anything.

### 9.2 Can this player cancel?

| # | Condition | Error code |
|---|---|---|
| 1 | Booking belongs to the caller | `not_your_booking` |
| 2 | Booking status is `confirmed` | `already_cancelled` |
| 3 | Now is before `starts_at - 3 hours` | `cancellation_window_closed` |

When rule 3 fails, the UI replaces the cancel button with a WhatsApp button and this copy: *"Cancellations within 3 hours of the session are handled by the coach. Message him on WhatsApp."*

### 9.3 What happens to money on cancellation

| Method | Cancelled > 3h before | Cancelled < 3h before, by coach |
|---|---|---|
| Cash | Nothing owed, no entry | Nothing owed, no entry |
| Credit | `+1` credit returned, reason `booking_refund` | Credit consumed, no return. Coach may override. |
| CliQ | Booking cancelled. The app records nothing. Coach refunds outside. | No refund. The app records nothing. |

The app never creates a balance entry from a cancellation. A player who cancels late owes nothing in the system.

### 9.4 When the coach cancels a whole session

1. Session status becomes `cancelled`, with `cancelled_at`, `cancelled_by`, and an optional note
2. Every `confirmed` booking becomes `cancelled_by_admin`
3. Every credit booking gets `+1` returned with reason `session_cancelled`, regardless of how close to start time it is
4. CliQ and cash bookings produce no financial record. The coach settles CliQ outside the app.
5. **No push notification is sent.** D31.
6. The coach is shown a prompt: *"Session cancelled. Post an announcement so players know?"* with buttons *Post announcement* and *Not now*. Choosing to post opens the announcement composer prefilled with the venue, date, and time. This respects D31 while giving him one deliberate tap. See A6.
7. `recompute_night_costs` runs for that venue and date, redistributing the night's court cost across the remaining sessions

### 9.5 Waitlist behaviour, precisely

- Joining requires no payment method and costs nothing
- A player may sit on any number of waitlists simultaneously
- A player may be booked into session X and waitlisted for session Y at the same time, including overlapping times
- Joining a waitlist for a session he is already booked into is rejected with `already_booked`
- When a spot opens and `now() <= starts_at - 1 hour`, every waiting player is pushed at once
- When a spot opens later than that, nothing happens at all, silently
- Claiming is just a normal booking call. Losers receive `session_full` and the UI shows: *"That spot has gone. You are still on the list."* without removing them from the list.
- Waitlist entries are cleaned up when the session starts

---

## 10. PAYMENTS AND THE REVIEW WORKFLOW

### 10.1 At booking time

| Method | Booking status | Payment status | expected_fils | Immediate side effect |
|---|---|---|---|---|
| `cash` | confirmed | unpaid | resolved price | none |
| `cliq` | confirmed | unpaid | resolved price | requires a proof upload before the RPC returns success |
| `credit` | confirmed | paid | 0 | one credit transaction of −1 |
| `free` | confirmed | waived | 0 | staff only, guests and coaches |

**CliQ flow, exactly:**

1. Player picks CliQ
2. The app shows the academy CliQ alias and the amount, with a copy button
3. Player taps *Attach screenshot*, picks from gallery or camera
4. The image is resized to a maximum 1600px on the long edge and compressed to JPEG quality 0.7 before upload
5. Upload to `payment-proofs/{user_id}/{booking_id}.jpg`
6. `create_booking` is called only after the upload succeeds, then the proof row is inserted
7. The spot is confirmed. No approval. No pending state. D34.

If the upload fails, no booking is created and the player sees a retry option. A booking must never exist with `payment_method = 'cliq'` and no proof row.

### 10.2 The review screen

Reachable from a session that is `pending_review` or `confirmed`, until it locks.

Each row shows: name or guest name, tier badge, method icon, expected amount, paid amount, and status chip.

Actions per row:

- **Mark paid.** Sets `paid_fils = expected_fils`, status `paid`. One tap. This is the common case and must be the largest touch target on the row.
- **Partial.** Opens a numeric input, prefilled with `expected_fils`. Entering less creates a balance entry for the remainder.
- **Not paid.** Sets `paid_fils = 0`, creates a balance entry for the full amount.
- **View proof.** CliQ rows only. Opens the screenshot full screen, pinch to zoom.
- **Change method.** In case the player said CliQ and turned up with cash.
- **Remove from session.** With the credit return prompt if applicable.

Header actions: *Add player*, *Add guest*, *Add coach*, and *Confirm session*.

Footer summary, always visible: expected total, collected total, outstanding total, and the session's cost and profit.

**The 7 day rule.** Everything above stays available until `ends_at + 7 days`. After that the session is `locked` and every control becomes read only, with a note explaining why. There is no unlock.

### 10.3 Balances

A balance entry is created only by `record_payment`, and only from the review screen. It is never created by a cancellation, a no show, or an unpaid subscription.

The coach's view of a player profile shows: total owed, and every entry with date, session, amount, and note. He can add a manual entry (positive to add debt, negative to record a settlement) and delete any entry.

Balances never block a booking, never appear in a push notification, and never gate a feature. D40.

---

## 11. SUBSCRIPTIONS

### 11.1 Packages

| Name | Visits | Price | Months | Per visit |
|---|---|---|---|---|
| 8 visits, 1 month | 8 | 40 JD | 1 | 5.000 JD |
| 15 visits, 1 month | 15 | 70 JD | 1 | 4.667 JD |
| 20 visits, 2 months | 20 | 90 JD | 2 | 4.500 JD |
| 30 visits, 2 months | 30 | 125 JD | 2 | 4.167 JD |
| 40 visits, 3 months | 40 | 160 JD | 3 | 4.000 JD |

`per_visit_fils` is snapshotted onto `player_subscriptions` at grant time, so later price changes never rewrite history.

### 11.2 Granting

Coach or admin, from the player profile:

1. Choose a package
2. Choose a start date, defaulting to today
3. Expiry auto-fills to start + duration months, and is editable
4. Optionally override the granted visit count
5. Optional note, for example "paid 80, 45 remaining"

The grant writes one `credit_transactions` row with `delta = granted_visits`, reason `grant`.

The app does not track whether the player paid for the subscription. D50. If the coach wants that recorded, he uses a balance entry.

### 11.3 Migration of current subscribers

This is a real, immediate need, not a hypothetical. There are a handful of people mid-subscription today.

The player profile has an **Adjust credits** action:

- Amount, positive or negative
- Required note
- Writes a `manual_adjustment` transaction

Documented flow for the coach: grant the full 40 visit package, then adjust by −13 with the note "used before the app". The remaining balance reads 27 and the history explains itself forever.

Do not make him book and cancel phantom sessions. Do not build a special import screen. The adjust action is enough.

### 11.4 Consumption

- One credit per session, standard or extended alike. D52.
- On extended sessions, the cash difference is settled with the coach in person and is **not recorded anywhere in the app**. D53. No balance entry. No prompt at booking beyond a single informational line: *"Your credit covers this session. The price difference is paid to the coach at the venue."*
- If a player has no usable credit, the credit option is disabled with the reason shown
- Multiple subscriptions: nearest expiry first

### 11.5 Expiry

The nightly job voids subscriptions past `expires_on` by writing an `expiry` transaction that brings the balance to exactly zero, then setting `is_voided = true`. The history remains readable.

Only the coach extends, by editing `expires_on` on a non-expired subscription. Editing an expired subscription is blocked. D55.

### 11.6 What the player sees

Total credits remaining across all active subscriptions, and per subscription: package name, remaining, expiry date, and a warning chip when fewer than 7 days remain. No purchase button anywhere.

---

## 12. COSTS, REVENUE, PROFIT

### 12.1 Cost allocation

Court cost is quoted per night. Water is per session. Coach fees are per day.

```
sessions_that_night = count of session_instances for (venue, date)
                      with status not in ('cancelled')

court_cost_share  = splitEvenly(night_court_cost, sessions_that_night)[index]
water_cost        = 1250 fils if standard, 2500 fils if extended
coach_fee_total   = 10000 fils × distinct assistant coaches that night
coach_fee_share   = splitEvenly(coach_fee_total, sessions_that_night)[index]

session_cost = court_cost_share + water_cost + coach_fee_share
```

`recompute_night_costs(venue, date)` runs when a session on that night is created, cancelled, or has an assistant coach added or removed. It only touches sessions whose status is `scheduled`, `in_progress`, or `pending_review`. Once a session is `confirmed` or `locked`, its cost snapshot is frozen.

**The night key for coach fees** is `venue_id || session_date`. One assistant coach present for both Saturday sessions at Khalda costs 10 JD, not 20. D76.

### 12.2 Revenue recognition

```
cash_revenue   = sum(paid_fils) where method='cash'  and status in ('paid','partial')
cliq_revenue   = sum(paid_fils) where method='cliq'  and status in ('paid','partial')
credit_revenue = sum(subscription.per_visit_fils) for each credit booking
free_revenue   = 0
```

Three rules that must not be violated:

1. A credit is worth the per-visit rate of the subscription it came from, between 4.000 and 5.000 JD. Never the 6 JD session price.
2. A free guest, a 0 JD custom rate player, and a coach slot all contribute zero revenue while consuming a court slot.
3. Unpaid amounts are not revenue. They are balance entries. Revenue counts money received.

### 12.3 Profit

```
session_profit = (cash + cliq + credit revenue) − session_cost
```

An unpaid assistant coach is shown as an accrued cost with a marker, not as cash spent. The report shows both "profit" and "profit if all outstanding is collected", because the coach will want both numbers.

### 12.4 Break even reference

For the developer's test fixtures.

| Session | Cost | Break even at list price |
|---|---|---|
| Khalda Sat, each of two | 31.25 JD | 6 players at 6 JD |
| Khalda Mon extended | 52.50 JD | 7 players at 8 JD |
| Khalda Thu, each of two | 31.25 JD | 6 players |
| Khalda Fri | 31.25 JD | 6 players |
| Shmeisani Sun, each of two | 25.00 JD | 5 players |
| Shmeisani Tue extended | 37.50 JD | 5 players |
| Shmeisani Wed, each of two | 25.00 JD | 5 players |
| Shmeisani Fri | 23.75 JD | 4 players |

---

## 13. THE MATCHMAKING ENGINE

The most important screen in the app and the one the coach judges it by. It lives entirely on the coach's phone, runs in TypeScript, and persists its result to Postgres.

### 13.1 Inputs

```typescript
interface LineupInput {
  sessionId: string;
  courtCount: number;              // 3 or 4
  rotationCount: number;           // 4 for standard, 6 for extended
  attendees: Attendee[];           // confirmed bookings
  lockedCourts: LockedCourt[];     // court number -> exactly 4 booking ids
  pairingRules: PairingRule[];     // never_pair, always_pair
  seed?: number;                   // for reproducible tests
}

interface Attendee {
  bookingId: string;
  displayName: string;
  tierValue: number;               // 1 = C-, 9 = A+
  isCoach: boolean;
}
```

A player with no tier assigned defaults to `5` (B) for the purposes of generation, and the UI shows a subtle "unrated" marker so the coach can fix it.

### 13.2 Output

```typescript
interface Lineup {
  rotations: Rotation[];
}
interface Rotation {
  index: number;                   // 1-based
  rule: 'rule_1_similar' | 'rule_2_mixed';
  courts: Court[];
  sitOuts: string[];               // booking ids
}
interface Court {
  courtNumber: number;
  team1: [string, string];         // booking ids
  team2: [string, string];
}
```

### 13.3 Rule assignment

```
rule(index) = index % 2 === 1 ? RULE_1_SIMILAR : RULE_2_MIXED
```

Rotation 1 → rule 1. Rotation 2 → rule 2. Rotation 3 → rule 1. Rotation 4 → rule 2. Rotation 5 → rule 1. Rotation 6 → rule 2. A seventh, if the coach adds one, → rule 1. D59, D62.

### 13.4 Hard constraints

Never violated. If a candidate arrangement violates one, it is discarded, not penalised.

1. Exactly 4 players per active court
2. No player appears twice in a rotation
3. Locked courts keep exactly their 4 players, on their court number, in every rotation
4. `always_pair` players are on the same team whenever both are playing
5. `never_pair` players are never on the same team
6. Sit-out counts are as even as possible: no player sits out twice before every other player has sat out once

### 13.5 Soft constraints and weights

The score is a sum of penalties. Lower is better. Weights are constants in `src/features/matchmaking/weights.ts`, exported so they can be tuned without touching the algorithm.

```typescript
export const WEIGHTS = {
  RULE1_COURT_SPREAD:      10,  // per tier point of spread within a court
  RULE2_TEAM_GAP_SHORTFALL: 8,  // per tier point below the target intra-team gap
  RULE2_TEAM_IMBALANCE:     6,  // per tier point of difference between the two teams
  PARTNER_REPEAT:          25,  // per repeated partnership within one session
  OPPONENT_REPEAT:          4,  // per repeated opposition within one session
  SITOUT_UNFAIRNESS:       15,  // per sit-out above the minimum for that player
  UNPLAYED_PAIR_BONUS:     -2,  // reward for a partnership not yet seen
};

export const RULE2_TARGET_GAP = 3; // tier points between partners, e.g. A- with B-
```

**Rule 1 scoring, per court:**

```
spread  = max(tier) − min(tier) across the 4 players
penalty = spread × RULE1_COURT_SPREAD
```

Teams within a rule 1 court are then split to balance: strongest with weakest of the four, middle two together. This keeps the match itself competitive even inside a homogeneous court.

**Rule 2 scoring, per court:**

```
for each team:
  gap = |tierA − tierB|
  shortfall = max(0, RULE2_TARGET_GAP − gap)
  penalty += shortfall × RULE2_TEAM_GAP_SHORTFALL

imbalance = |(team1 sum) − (team2 sum)|
penalty += imbalance × RULE2_TEAM_IMBALANCE
```

This is the coach's exact instruction expressed numerically: each team must contain one stronger and one weaker player, and the two teams must still be an even match.

**Partner repeats.** `PARTNER_REPEAT` applies within a session. For standard sessions the weight is 25, high enough to be effectively avoided. For extended sessions the weight drops to 8, because the coach said repeats are acceptable across 6 rotations with 12 players, where avoiding them entirely is combinatorially impossible. D64.

```typescript
const partnerWeight = sessionType === 'standard' ? 25 : 8;
```

### 13.6 Algorithm

```
generateLineup(input):
  rng = seededRandom(input.seed ?? Date.now())
  history = new PairHistory()          // partner and opponent counts
  sitOutCounts = new Map()
  rotations = []

  for i in 1..rotationCount:
    rule = i % 2 === 1 ? RULE_1 : RULE_2
    playing, sitting = selectPlayers(attendees, courtCount*4, sitOutCounts, rng)
    courts = seedAssignment(playing, rule, lockedCourts, rng)
    courts = hillClimb(courts, rule, history, input, rng)
    rotations.push({ index: i, rule, courts, sitOuts: sitting })
    history.record(courts)
    incrementSitOuts(sitting, sitOutCounts)

  return { rotations }
```

**`selectPlayers`.** If attendees ≤ court capacity, everybody plays. Otherwise sort by sit-out count ascending, take the top N, and break ties with the seeded RNG so it is not always the same people.

**`seedAssignment`, rule 1.** Sort playing attendees by tier descending. Deal them into courts in blocks of four: the four strongest to court 1, next four to court 2, and so on. When a tier band straddles a court boundary, the leftover player is assigned to the court above or below **at random**, using the seeded RNG, and the direction is deliberately varied between rotations. D63.

**`seedAssignment`, rule 2.** Sort by tier descending, split into a top half and a bottom half, then pair the strongest of the top half with the weakest of the bottom half, and so on, snake style. Place two such pairs per court.

**`hillClimb`.** Up to 400 iterations or 150 milliseconds, whichever comes first:

1. Pick two random players on different unlocked courts, or two players on the same court but different teams
2. Swap them
3. Rescore
4. Keep the swap if the score improved, otherwise revert
5. Every 50 iterations, accept a neutral swap to escape plateaus

For 12 to 20 players this converges well inside the time budget. This is deliberately not simulated annealing; the search space is small and the coach overrides anything he dislikes anyway.

### 13.7 Under capacity

| Players | Courts available | Behaviour |
|---|---|---|
| 16 on 4 courts | 4 | 4 full doubles |
| 14 on 4 courts | 3 full + 1 partial | 3 doubles, plus one court with 2 players as a singles |
| 10 on 3 courts | 2 full + 1 partial | 2 doubles and 1 singles. The coach's stated example. |
| 6 on 3 courts | 1 full + 1 partial | 1 doubles, 1 singles |
| 4 or fewer | 1 | Single court, doubles if 4, singles if 2, and a warning banner if 3 |
| 0 | none | Empty state with a *Cancel session* button |

Partial courts are always the highest numbered courts, so court 1 is always full. A singles court renders as two tiles rather than four.

### 13.8 Regeneration

`has_manual_lineup` on the session governs everything.

- While `false`: any booking change (create, cancel, admin add, admin remove) discards and regenerates the whole lineup automatically
- The moment the coach drags, swaps, or locks anything, set it to `true`
- While `true`: booking changes do **not** touch the lineup. Instead the court board shows a banner: *"3 changes since this lineup was made"* with a *Regenerate* button
- Pressing regenerate wipes manual edits, sets the flag back to `false`, and rebuilds from scratch. It asks for confirmation first, because it destroys work.
- Locked courts and pairing rules survive regeneration. They are inputs, not results.

D66.

### 13.9 Manual editing

- **Drag** a player tile onto another player tile to swap them. Cross-court and same-court both work.
- **Tap** a player to select, tap another to swap. Required as an accessible alternative to dragging on a small phone.
- **Long press a court** to lock it. A locked court shows a padlock and is excluded from all future generation.
- Swapping into or out of a locked court is blocked with a toast explaining why.
- Every edit writes immediately to `court_assignments`. There is no save button.
- Undo: a single-level undo of the last swap, available for 10 seconds as a toast action.

### 13.10 Court board display

The screen the coach reads aloud from, so it must be legible at arm's length under gym lighting.

- Rotation selector at the top: chips 1 through N, current one highlighted, swipeable
- One card per court. Court number as a large heading.
- Four player tiles per card, arranged two above two, with a dividing line between the teams
- Each tile: first name in large bold text, family name smaller, tier badge in the corner
- Sit-outs in a separate section at the bottom, headed "Resting"
- A banner when the lineup is stale
- Minimum font size for player names: 18pt. No truncation below 12 characters; wrap instead.

---

## 14. PLAYER APP, SCREEN BY SCREEN

Every screen specifies: purpose, layout, states, actions, validation, and error copy. Every screen has a WhatsApp affordance unless stated otherwise.

### 14.0 Navigation

```
RootNavigator
├── AuthNavigator (not signed in)
│   ├── Welcome
│   ├── SignIn
│   ├── SignUp
│   ├── VerifyEmail
│   └── ForgotPassword
├── PlayerNavigator (role = player)
│   └── BottomTabs
│       ├── Schedule    (stack: ScheduleList → SessionDetail → BookingConfirm)
│       ├── MyBookings  (stack: BookingList → BookingDetail)
│       ├── Announcements
│       └── Profile     (stack: Profile → EditProfile → Subscriptions → Language → DeleteAccount)
└── AdminNavigator (role = admin | coach | assistant_coach)
    └── BottomTabs
        ├── Today       (stack: TodayList → SessionManage → CourtBoard → Review)
        ├── Schedule    (stack: AdminSchedule → SessionEdit → CreateSession)
        ├── Players     (stack: PlayerList → PlayerProfile → GrantSubscription → AdjustCredits)
        └── More        (stack: Announcements → Reports [coach only] → Settings)
```

An assistant coach sees the admin tabs but with a reduced permission set: he can view Today and the court board, and nothing else. Enforced by RLS, not just by hiding tabs.

### 14.1 Welcome

- Logo centred on the dark background, wordmark below
- Two buttons: *Sign in*, *Create account*
- Language toggle in the top corner, Arabic default
- No WhatsApp affordance here, since a stranger has no reason to message the coach

### 14.2 Sign up

Fields, in this order, all required:

| Field | Type | Validation | Error key |
|---|---|---|---|
| First name | text | 1 to 50 characters after trim | `validation.firstNameRequired` |
| Last name | text | 1 to 50 characters after trim | `validation.lastNameRequired` |
| Email | email keyboard | RFC-ish regex, lowercased and trimmed before submit | `validation.emailInvalid` |
| Phone | phone keyboard | 9 to 15 digits, optional leading `+`, spaces and dashes stripped before submit | `validation.phoneInvalid` |
| Password | secure | minimum 8 characters, at least one letter and one digit | `validation.passwordWeak` |
| Confirm password | secure | must match | `validation.passwordMismatch` |

Behaviour:

- Submit disabled until the form is valid
- On success, create the `auth.users` row and a `profiles` row in a trigger, then navigate to VerifyEmail
- Duplicate email → `error.emailInUse`, with a *Sign in instead* link
- No terms checkbox, no marketing opt-in, no referral code

### 14.3 Verify email

- Explains that a link was sent, shows the address, offers *Resend* with a 60 second cooldown
- Polls the session every 5 seconds while foregrounded, and advances automatically on confirmation
- *Change email* link returns to a small form
- The player can skip and browse, but any booking attempt returns `email_not_confirmed` and shows a prompt back to this screen

### 14.4 Sign in

Email, password, *Forgot password*. Wrong credentials → `error.invalidCredentials`, deliberately not distinguishing between a wrong email and a wrong password.

### 14.5 Forgot password

Email input, sends the Supabase reset link, then a confirmation screen. Always reports success even for unknown addresses, to avoid disclosing which emails exist.

### 14.6 Schedule list

The app's home screen.

**Layout.** Sessions grouped by day, sticky day headers, ordered by start time. Each card shows:

- Venue name and area
- Start and end time
- Session type chip: 90 or 150 minutes
- Price, or the player's custom rate when one is set
- Occupancy: a filled progress bar plus text, "8 of 16 booked" or "4 spots left"
- A booked chip when the player already has a spot
- Right chevron

**Occupancy display is identical at every visibility level.** The count is not private. Only names and tiers are.

**States:**

| State | Presentation |
|---|---|
| Loading | Three skeleton cards, no spinner |
| Empty | "No sessions in the next 5 days." Plus the WhatsApp button. |
| Error | "Could not load the schedule." Retry button plus WhatsApp. |
| Offline | Persistent banner "No internet connection", cached list greyed out and non-interactive |

Pull to refresh. Auto refetch on focus and every 60 seconds while the screen is in the foreground.

### 14.7 Session detail

**Always visible:** venue with a maps link, date, full time range, duration, price, courts, spots remaining, and the WhatsApp button.

**The attendee section, by visibility level:**

| Level | Shows |
|---|---|
| 0 | "9 players booked. 7 spots left." Nothing else. Not even a list of anonymous rows. |
| 1 | A grid of tier badges only, for example A, A-, B+, B, B, B-, C+. Sorted strongest first. The player's own badge is outlined. |
| 2 | A list of names with tier badges, in booking order, own row highlighted |

Never any court information, at any level.

**Primary action, by state:**

| Condition | Button |
|---|---|
| Not booked, spots left, before cutoff | *Reserve a spot* |
| Not booked, full, before cutoff | *Join the waiting list* |
| On the waiting list | *Leave the waiting list*, plus explanatory text about first-come claiming |
| Booked, more than 3 hours out | *Cancel my reservation*, secondary style |
| Booked, less than 3 hours out | Disabled state plus *Message the coach on WhatsApp* |
| After the 1 hour cutoff, not booked | Disabled *Booking closed*, plus WhatsApp |
| Session cancelled | Red banner "This session was cancelled", no actions except WhatsApp |

### 14.8 Booking confirmation sheet

A bottom sheet, not a screen.

Shows the session summary and a payment method selector:

| Option | Subtitle | Disabled when |
|---|---|---|
| Cash on arrival | "Pay the coach at the venue" | never |
| CliQ | "Transfer now and attach a screenshot" | never |
| Use a credit | "3 credits left, expires 14 September" | no usable subscription; subtitle becomes "No credits available" |

If the player's custom rate is set, the amount shown is his rate, with no explanation of why it differs from the poster price. He knows.

For an extended session paid by credit, one line appears: *"Your credit covers this session. The price difference is paid to the coach at the venue."*

**CliQ sub-flow:** shows the CliQ alias with a copy button and the amount, then *Attach screenshot*, then a thumbnail with a *Replace* option, then *Confirm reservation*. The confirm button is disabled until an image is attached.

On success: a success state with a checkmark, the session summary, and *Done*. On `session_full`: *"Sorry, the last spot went while you were booking."* with a *Join the waiting list* button.

### 14.9 My bookings

Two segments: *Upcoming* and *Past*.

Upcoming rows: venue, date, time, payment method chip, and a cancel affordance when outside the 3 hour window. Past rows show the last 30 days only, greyed, no actions.

Empty state: "You have no reservations yet." with a button to the schedule.

### 14.10 Booking detail

Everything about one booking: session summary, payment method, and for CliQ, the uploaded screenshot thumbnail. Cancel button subject to the window. WhatsApp button.

The player is never shown `payment_status`, whether the coach marked him paid, or any balance. See assumption A4.

### 14.11 Announcements

Reverse chronological list of announcement bodies with relative timestamps. Text is displayed in whatever language it was written in, with the correct text direction detected per message rather than following the app language.

Tapping opens a detail view with selectable text and a WhatsApp button. Unread ones carry a dot; read state is local to the device.

Empty: "No announcements yet."

### 14.12 Profile

- Name, email, phone
- Credits summary card, tappable through to subscriptions
- Language toggle
- Notification permission status with a link to system settings when denied
- *Contact the coach on WhatsApp*
- Sign out
- *Delete my account*, in a muted destructive style at the bottom

The profile does not show the player's tier, his visibility level, or his balance.

### 14.13 Subscriptions

For each active subscription: package name, remaining credits as a large number, granted total, expiry date, and a warning chip within 7 days of expiry. Below, a *History* list of every credit transaction with reason and date, so a player can see exactly where his credits went.

Expired subscriptions appear in a collapsed section.

Empty state: "You do not have a subscription. Ask the coach on WhatsApp." with the WhatsApp button. No purchase flow exists anywhere in the app.

### 14.14 Delete account

Required by App Store review guideline 5.1.1(v). Not optional.

Flow: a screen explaining what happens, a confirmation dialog requiring the word DELETE typed, then the `delete-account` edge function.

What it does, per assumption A1:

1. Cancels all future bookings, returning credits
2. Anonymises the profile: names become "Deleted player", email and phone are nulled, `deleted_at` is set
3. Deletes device tokens and payment proof images
4. Deletes the `auth.users` row
5. Leaves past bookings, balance entries, and credit history intact but anonymised, so the coach's historical reports do not develop holes

Balances are not forgiven by deletion, and the coach is not notified. If the player owes money, that stays a matter between them on WhatsApp.

---

## 15. ADMIN APP, SCREEN BY SCREEN

### 15.1 Today

The default landing screen for staff. Lists today's sessions, then tomorrow's.

Each card: venue, time, occupancy, status chip, and a payment summary once the session is past. Primary tap goes to Session manage. A secondary *Court board* button appears within 2 hours of start.

Empty state: "No sessions today."

### 15.2 Session manage

The operational hub for one session. Tabs: **Players**, **Court board**, **Money**.

**Players tab.** The attendee list with tier badges and payment method chips. Header buttons: *Add player*, *Add guest*, *Add coach*. The row gesture is a tap, opening a menu (`RowActionsSheet`) rather than the row itself acting — see 15.2's own note in `SessionManageScreen.tsx` for why a swipe or long press was not used. *Remove* and *Move to another session* (`admin_move_booking`, D81) are both built; *Change tier* is 15.8's tier picker and is not, tracked in OPEN-ITEMS.md.

**Add player.** A search field over registered players, minimum 2 characters, `pg_trgm` matching on the full name, results showing name, tier, and credit balance. Selecting one shows a confirmation sheet:

- If he has credits: "Use 1 credit" preselected, with "Cash instead" as an alternative
- If he does not: "Cash, marked paid" preselected, per D43, with a note that this can be changed during review
- Blocked if he is already booked, with the reason shown

**Add guest.** Name (required), tier (required, defaults to B), and a payment segment: *Paid* with an amount field defaulting to the session price, or *Free*. D45. A hint reads: "Free guests fill empty spots and are not counted as income."

**Add coach.** Picks from profiles with `role = 'assistant_coach'`, then a paid or unpaid toggle. The card shows the daily fee and warns when that coach is already on another session the same night: "Already added tonight. The 10 JD fee is counted once."

**Court board tab.** Section 13.10.

**Money tab.** The review interface, Section 10.2.

### 15.3 Admin schedule

A calendar-ish list, 30 days forward, grouped by day, including cancelled sessions in a struck-through style.

Row actions: *Edit this date*, *Cancel this session*, *Duplicate*.

Header: *Create a one-off session*.

### 15.4 Edit a dated session

Editable fields: start time, duration, price, court count, notes.

**Capacity reduction guard.** If the new court count would reduce capacity below the current confirmed booking count, the save is blocked with: *"12 players are booked but 3 courts hold only 12. Remove players first."* and a shortcut to the players tab. The app never auto-removes anyone. Assumption A3.

**Price changes never affect existing bookings.** Each booking snapshotted `expected_fils` at creation. The confirmation dialog states: *"New price applies to new bookings only. 7 existing bookings keep the price they booked at."*

Changing the time re-derives `starts_at` and `ends_at`, and therefore every cutoff. Bookings survive.

### 15.5 Cancel a session

Confirmation dialog listing exactly what will happen: how many bookings will be cancelled, how many credits returned, and the reminder that **no notification is sent**. An optional note field.

After cancelling, the announcement prompt from Section 9.4.

### 15.6 Create a one-off session

Venue, date, start time, duration (90 or 150), price, court count, rotation count. No recurrence option; one-off means one-off. Used for extra games, not tournaments, which do not exist in the app.

### 15.7 Player list

Searchable, filterable by tier, by visibility level, by "has an active subscription", and by "owes money". Sortable by name, tier, or amount owed.

Each row: name, tier badge, visibility level chip, credits remaining, and amount owed when non-zero.

### 15.8 Player profile, admin view

Sections:

1. **Identity.** Name, email, phone, joined date, WhatsApp button for this player's own number.
2. **Tier.** Current tier with a picker of all nine values, plus the change history.
3. **Visibility level.** Segmented control, 0, 1, 2, with a one-line explanation of each.
4. **Custom rate.** Two fields, standard and extended, each defaulting to the session price with a "Default" reset. Explanatory text: "What this player pays. Leave as default unless you have agreed otherwise." Zero is valid.
5. **Subscriptions.** Active and expired, with *Grant a subscription*, *Extend*, and *Adjust credits*.
6. **Balance.** Total owed, entry list, *Add an entry* and *Record a settlement*.
7. **Recent sessions.** Last 20 bookings with payment outcomes.
8. **Role.** Coach only: promote to admin or assistant coach, or demote.

### 15.9 Grant a subscription

Package picker showing visits, price, duration, and per visit rate. Start date defaulting to today. Expiry auto-filled and editable. Visit count override. Note field. A summary line before saving: *"40 credits, expires 20 November 2026."*

### 15.10 Adjust credits

Subscription picker, signed amount, required note, and a preview: *"Balance goes from 40 to 27."* Save writes one `manual_adjustment` transaction.

### 15.11 Announcements, admin

List of published announcements with a compose button. Composer: a language selector defaulting to Arabic, a body field with a 2000 character counter, and a preview. Publishing sends a push to every registered device immediately. A confirmation dialog states how many devices will receive it. Announcements can be soft deleted, which does not recall the push.

### 15.12 Reports, coach only

Month picker at the top. Sections:

1. **Revenue.** Total, split by cash, CliQ, and credits, with a bar per week.
2. **Sessions.** Count run, count cancelled, average occupancy.
3. **Profit.** Total revenue minus total cost, plus the "if all outstanding is collected" figure.
4. **Per session table.** Date, venue, time, players, revenue, cost, profit, sortable.
5. **Attendance by slot.** Every recurring slot with average fill over the month, so dying slots are obvious.
6. **Fill rate by venue.**
7. **Subscriptions.** Sold this month, credits used, credits expired unused.
8. **Outstanding.** Total owed, with the top ten debtors.
9. **Players.** Active this month against last month, and new registrations.

An admin opening this tab sees a permission denied state, and the API refuses the query as well.

---

## 16. LOCALIZATION

### 16.1 Rules

- Arabic is the default language for a new install, regardless of device locale, because the majority of players are Jordanian. The device locale is used only as a tiebreak when it is English.
- Language is stored on the profile as `preferred_locale` and mirrored to device storage so it survives before login.
- Changing language switches direction. `I18nManager.forceRTL()` requires an app reload on Android; show a dialog: *"The app will restart to change language."*
- Never concatenate translated fragments. Use interpolation: `t('session.spotsLeft', { count })`.
- Use i18next plurals for anything counted. Arabic has six plural forms; do not fake it with an `if`.
- Numbers: Western Arabic numerals (0-9) in both languages. Jordanians read them fine and it avoids mixed-numeral confusion in times and money.
- Dates in Arabic use Levantine month names (كانون الثاني، شباط، آذار...), not transliterated Gregorian ones.
- Times display as 12 hour with AM/PM in English, and with صباحاً / مساءً in Arabic.

### 16.2 RTL specifics

- Use `start`/`end` instead of `left`/`right` in every style
- Icons that imply direction (chevrons, back arrows, progress) must flip; icons that do not (clock, money, court) must not
- The court board does **not** mirror. Court 1 stays leftmost in both languages, because the coach reads it against the physical hall.
- Phone numbers and email addresses are always LTR, wrapped in a bidi isolate
- Test every screen in Arabic before calling a phase done. Not at the end of the project.

### 16.3 String deck

Namespaced keys. `en.json` and `ar.json` must always have identical key sets; CI fails if they diverge. Abbreviated here to the structure plus representative entries; the implementing agent creates the full set as screens are built.

```json
{
  "common": {
    "cancel": "Cancel",
    "confirm": "Confirm",
    "save": "Save",
    "delete": "Delete",
    "retry": "Try again",
    "close": "Close",
    "done": "Done",
    "loading": "Loading",
    "whatsapp": "Message the coach",
    "jd": "JD"
  },
  "auth": {
    "welcomeTitle": "Professional of Badminton",
    "signIn": "Sign in",
    "signUp": "Create account",
    "verifyTitle": "Check your email",
    "verifyBody": "We sent a confirmation link to {{email}}.",
    "resend": "Resend the link",
    "resendCooldown": "You can resend in {{seconds}} seconds"
  },
  "schedule": {
    "title": "Sessions",
    "empty": "No sessions in the next 5 days.",
    "spotsLeft_zero": "Full",
    "spotsLeft_one": "1 spot left",
    "spotsLeft_two": "2 spots left",
    "spotsLeft_few": "{{count}} spots left",
    "spotsLeft_many": "{{count}} spots left",
    "spotsLeft_other": "{{count}} spots left",
    "booked": "You are booked",
    "bookedCount": "{{count}} of {{capacity}} booked",
    "closed": "Booking closed",
    "cancelledBanner": "This session was cancelled"
  },
  "session": {
    "reserve": "Reserve a spot",
    "joinWaitlist": "Join the waiting list",
    "leaveWaitlist": "Leave the waiting list",
    "waitlistExplain": "When a spot opens everyone on the list is told at once. The first to reserve gets it.",
    "cancelReservation": "Cancel my reservation",
    "cancelWindowClosed": "Cancellations within 3 hours are handled by the coach.",
    "attendeesLevel0": "{{count}} players booked.",
    "attendeesLevel1": "Levels of who is coming",
    "attendeesLevel2": "Who is coming"
  },
  "payment": {
    "chooseMethod": "How will you pay?",
    "cash": "Cash on arrival",
    "cashSub": "Pay the coach at the venue",
    "cliq": "CliQ",
    "cliqSub": "Transfer now and attach a screenshot",
    "credit": "Use a credit",
    "creditSub_other": "{{count}} credits left, expires {{date}}",
    "noCredits": "No credits available",
    "attachScreenshot": "Attach screenshot",
    "replaceScreenshot": "Replace",
    "copyAlias": "Copy CliQ alias",
    "extendedTopUp": "Your credit covers this session. The price difference is paid to the coach at the venue."
  },
  "error": {
    "generic": "Something went wrong. Try again.",
    "network": "No internet connection.",
    "sessionFull": "Sorry, the last spot went while you were booking.",
    "bookingClosed": "Booking closed one hour before the session.",
    "tooFarAhead": "Sessions open 5 days ahead.",
    "alreadyBooked": "You already have a spot in this session.",
    "noCredits": "You have no credits left.",
    "confirmEmailFirst": "Confirm your email before booking.",
    "cancellationWindowClosed": "It is too late to cancel here. Message the coach.",
    "invalidCredentials": "Email or password is wrong.",
    "emailInUse": "That email already has an account.",
    "uploadFailed": "The screenshot did not upload. Try again."
  },
  "validation": { "...": "one key per rule in section 14.2" },
  "admin": { "...": "one namespace per admin screen" },
  "tiers": { "aPlus": "A+", "a": "A", "aMinus": "A-", "...": "" },
  "notifications": {
    "waitlistTitle": "A spot opened",
    "waitlistBody": "{{venue}}, {{time}}. First to reserve gets it.",
    "announcementTitle": "Professional of Badminton",
    "announcementBody": "{{preview}}"
  }
}
```

Arabic equivalents, for the entries above, as a style reference:

```json
{
  "common": { "cancel": "إلغاء", "confirm": "تأكيد", "whatsapp": "راسل الكابتن" },
  "schedule": {
    "spotsLeft_zero": "ممتلئة",
    "spotsLeft_one": "بقي مكان واحد",
    "spotsLeft_two": "بقي مكانان",
    "spotsLeft_few": "بقي {{count}} أماكن",
    "spotsLeft_many": "بقي {{count}} مكانًا",
    "spotsLeft_other": "بقي {{count}} مكان"
  },
  "session": {
    "reserve": "احجز مكانك",
    "cancelWindowClosed": "الإلغاء قبل أقل من ٣ ساعات يتم عن طريق الكابتن."
  },
  "payment": {
    "cash": "نقدًا عند الحضور",
    "cliq": "كليك",
    "extendedTopUp": "الاشتراك يغطي هذه الجلسة، وفرق السعر يُدفع للكابتن في الصالة."
  }
}
```

---

## 17. DESIGN SYSTEM

### 17.1 Tokens

```typescript
export const colors = {
  bg:            '#111111',
  bgElevated:    '#1C1C1C',
  bgSurface:     '#2A2A2A',
  border:        '#3A3A3A',
  accent:        '#A8D5BA',
  accentPressed: '#8FC4A4',
  accentText:    '#0B1F14',
  textPrimary:   '#FFFFFF',
  textSecondary: '#B0B0B0',
  textTertiary:  '#7A7A7A',
  success:       '#6FCF97',
  warning:       '#E2B93B',
  danger:        '#E06C5A',
  info:          '#7FB3D5',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radii   = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  display: { size: 32, weight: '700', lineHeight: 40 },
  title:   { size: 24, weight: '700', lineHeight: 32 },
  heading: { size: 18, weight: '600', lineHeight: 26 },
  body:    { size: 16, weight: '400', lineHeight: 24 },
  small:   { size: 14, weight: '400', lineHeight: 20 },
  caption: { size: 12, weight: '400', lineHeight: 16 },
  courtName: { size: 20, weight: '700', lineHeight: 26 },
} as const;
```

Fonts: system font for English (SF Pro, Roboto). **Cairo** for Arabic, bundled via `expo-font`, weights 400 and 700. Load before the first render to avoid a flash.

Dark theme only. There is no light theme, and no system theme following. The academy's identity is black and mint.

### 17.2 Tier badges

Circle or pill, 28pt minimum, with a colour band by letter family and the label always visible as text. Never colour alone, since players will be told their tier by a coach who is colour blind for all we know.

| Family | Background | Text |
|---|---|---|
| A tiers | `#A8D5BA` | `#0B1F14` |
| B tiers | `#7FB3D5` | `#08202E` |
| C tiers | `#B0B0B0` | `#1A1A1A` |
| Unrated | transparent with a dashed border | `#7A7A7A` |

### 17.3 Components to build in `components/primitives`

`Button` (primary, secondary, ghost, destructive, each with loading and disabled), `Text` (typography variants, auto RTL alignment), `Input`, `NumericInput` (money aware), `Card`, `Sheet`, `Chip`, `Badge`, `Avatar` (initials only, no photos), `ProgressBar`, `SegmentedControl`, `Switch`, `Skeleton`, `Toast`, `Dialog`, `EmptyState`, `ErrorState`, `WhatsAppButton`.

`components/domain`: `SessionCard`, `TierBadge`, `PlayerRow`, `PaymentRow`, `CourtTile`, `CourtCard`, `RotationChips`, `CreditSummary`, `OccupancyBar`.

### 17.4 Interaction rules

- Minimum touch target 44×44
- Every destructive action confirms, except undoable ones
- Every mutation shows optimistic feedback where safe, and rolls back visibly on failure
- Toasts for success, dialogs for failure that needs a decision, inline text for validation
- No spinners longer than 400ms without a skeleton
- Haptic feedback on booking success and on court board swaps

---

## 18. NOTIFICATIONS

Exactly two triggers. D70.

| Trigger | Audience | Title | Body |
|---|---|---|---|
| Waitlist spot opens | Every active waitlist entry on that session, only if more than 1 hour before start | "A spot opened" | "{{venue}}, {{time}}. First to reserve gets it." |
| Announcement published | Every registered device | "Professional of Badminton" | First 120 characters of the body |

Implementation:

- Tokens registered on login and refreshed on every cold start, stored in `device_tokens`
- Language for the payload comes from the device row, not the sender
- Deep links: waitlist → session detail; announcement → announcement detail
- Dead tokens returned by Expo's receipt API are deleted
- Permission is requested contextually, the first time the player joins a waiting list, not on first launch
- If permission is denied, the waitlist still works and the app says so plainly: *"Turn on notifications to hear when a spot opens."*

**Nothing else pushes.** Not booking confirmations, not reminders, not session cancellations, not payment confirmations, not subscription expiry.

---

## 19. TESTING AND ACCEPTANCE

### 19.1 What must be tested

**Unit, pure logic. Jest.**

- `money.ts`: fils conversion, formatting in both locales, `splitEvenly` remainder behaviour including 47500 across 2 and 3
- `time.ts`: window and cutoff computations across midnight, and against a device clock set wrong
- `tiers.ts`: ordering, numeric mapping both directions
- Matchmaking: a full suite, Section 19.2
- `resolve_price` equivalents on the client
- Credit selection order

**Integration, against a local Supabase.**

- `create_booking` concurrency: two simultaneous calls on the last spot produce one booking and one `session_full`
- Every rejection path in Section 9.1
- Cancellation windows on both sides of the 3 hour boundary, tested at 2h59m and 3h01m
- Credit deduction, return, and non-return inside 3 hours
- `record_payment` producing correct balance entries for full, partial, zero, and waived
- Session lock after 7 days blocks every mutation
- Night cost recomputation when one of two sessions is cancelled
- RLS: a level 0 player querying `get_session_attendees` receives no names and no tiers; a direct select on `bookings` returns only his own rows; an admin selecting from report views is refused

**Component, React Native Testing Library.**

- Session detail renders the correct attendee section for each of the three levels
- The primary action button matches the state table in Section 14.7 for all eight states
- Payment sheet disables credit correctly and shows the extended top-up line only for extended sessions
- Court board swap updates both tiles

**End to end, Maestro, two flows only.**

1. Register, confirm, browse, book with cash, see it in My Bookings, cancel it
2. Coach signs in, opens today's session, adds a guest, opens the court board, swaps two players, opens Money, marks everyone paid, confirms the session

### 19.2 Matchmaking test fixtures

Every one of these is a test case with a fixed seed and asserted properties, not asserted exact output.

| Fixture | Players | Courts | Asserts |
|---|---|---|---|
| Even bands | 16, four each of A, B+, B, C | 4 | Rotation 1 has four homogeneous courts. Rotation 2 has every team spanning at least 2 tier points. |
| Ragged bands | 13 mixed | 4 | 1 sit-out per rotation, and across 4 rotations no player sits twice before all have sat once |
| Coach's example | 10 mixed | 3 | Two full courts and one 2-player court, every rotation |
| Top heavy | 12, eight A tiers and four C | 3 | Rule 2 rotations never put two C players on the same team |
| Locked court | 16, one court locked with 4 friends | 4 | Those four are on that court in all 4 rotations, and the other 12 are distributed among the rest |
| Never pair | 12 with one never_pair rule | 3 | The pair are never teammates in any rotation |
| Always pair | 12 with one always_pair rule | 3 | The pair are teammates in every rotation where both play |
| Partner repeats | 12 | 3, standard | Zero repeated partnerships across 4 rotations |
| Extended repeats | 12 | 3, extended | Repeats allowed but each partnership appears at most twice across 6 rotations |
| Tiny | 3 players | 3 | Renders a warning, does not crash, produces one court with 3 |
| Empty | 0 | 3 | Produces an empty lineup and the cancel prompt |
| Performance | 20 players, 6 rotations | 4 | Completes in under 300ms on a mid-range device |

### 19.3 Definition of done, every task

1. TypeScript compiles with no errors and no new `any`
2. ESLint passes
3. Tests for the new logic exist and pass
4. New strings exist in both `en.json` and `ar.json`
5. The screen has been viewed in Arabic and in English
6. Loading, empty, and error states exist and are reachable
7. New tables have RLS policies and a migration file
8. Nothing in Section 4 has been added

---

## 20. PHASED BUILD PLAN

Build in this order. Each phase ends with the stated acceptance criteria demonstrably passing. Do not begin a phase before the previous one is done.

### Phase 0, foundation

- Expo project, TypeScript strict, ESLint, Prettier, folder structure per Section 2.2
- Supabase projects created, CLI linked, migration workflow proven
- `src/lib/money.ts`, `src/lib/time.ts`, `src/lib/tiers.ts` with full unit tests
- Theme tokens, `Text`, `Button`, `Card`, `EmptyState`, `ErrorState`, `Skeleton`
- i18n initialised with both files and the RTL restart dialog

**Done when:** the app builds on both platforms, shows a themed placeholder, switches language and direction, and the three lib test suites pass.

### Phase 1, schema and security

- Every enum, table, index, view, and trigger from Section 6
- Every RLS policy from Section 7, including `get_session_attendees`
- Seed data from Section 22
- Generated TypeScript types committed

**Done when:** a psql session as an anonymous role can read nothing; as a level 0 player can read only counts and his own rows; as a level 2 player can read names; as an admin can read everything except report views; as the coach can read everything. Automated integration tests prove each.

### Phase 2, auth

- Sign up, sign in, verify email, forgot password, sign out
- Profile row creation trigger on `auth.users` insert
- Session persistence in `expo-secure-store`, refresh handling, sign out clears everything
- Role based navigator switching
- Delete account edge function and screen

**Done when:** a new user can register, confirm, sign in, be recognised as a player, and delete the account, and a deleted account cannot sign in.

### Phase 3, sessions and schedule

- `generate_sessions` plus the cron job
- Player schedule list, grouped, with occupancy
- Session detail with all three visibility variants
- Admin schedule, edit a dated instance, capacity guard, create one-off, cancel with the announcement prompt
- Night cost recomputation

**Done when:** seeded templates produce 21 days of correct sessions, the player sees exactly 5 days, cancelling one of two sessions on a night doubles the other's court cost share, and the capacity guard blocks an unsafe reduction.

### Phase 4, bookings

- `create_booking`, `cancel_own_booking`, `admin_remove_booking`
- Booking sheet with cash and credit paths, waiting list join and leave, `notify_waitlist` respecting the cutoff
- My bookings, booking detail
- Admin add player by search, add guest paid and free, add coach

**Done when:** every row in the Section 9.1 table produces its exact error, the concurrency test passes, and the 3 hour boundary behaves correctly on both sides.

### Phase 5, payments

- CliQ upload with compression, storage policies, proof rows
- Review screen with mark paid, partial, not paid, view proof, change method
- Balance entries with the rewrite-not-duplicate rule
- Session confirm, reopen, and the 7 day lock job

**Done when:** a partial payment of 4 JD against 6 JD produces exactly one balance entry of 2 JD, editing it to 5 JD leaves exactly one entry of 1 JD, and every mutation is refused after the lock.

### Phase 6, subscriptions

- Packages seeded, grant, extend, adjust credits, void on expiry
- Credit booking path, nearest expiry selection, return on cancellation
- Player subscription screen with history

**Done when:** the documented migration flow (grant 40, adjust −13, balance 27) works and reads correctly in the history, and an expired subscription cannot be extended.

### Phase 7, matchmaking

- The engine as a pure module with the full fixture suite from Section 19.2
- Court board with rotation chips, court cards, sit-outs
- Drag and tap-to-swap, court locking, pairing rules
- Auto regeneration and the staleness banner

**Done when:** every fixture passes, the coach's 10-on-3 example renders two doubles and a singles, and manual edits survive a new booking while the banner appears.

### Phase 8, announcements and push

- Composer, list, detail, soft delete
- Token registration, `send-push`, deep links, dead token pruning
- Waitlist push respecting the 1 hour rule

**Done when:** publishing an announcement reaches a physical device on both platforms, and a spot freed 40 minutes before start sends nothing.

### Phase 9, reports

- All nine sections from 15.12
- Coach only, enforced in the API

**Done when:** a month of seeded data produces revenue that reconciles to the sum of payments, credit revenue valued at package rates, and an admin receives a permission error.

### Phase 10, polish and release

- Every screen reviewed in Arabic
- Every loading, empty, and error state verified
- Sentry wired
- App icons, splash, store listings in both languages
- Privacy policy and account deletion URL
- TestFlight and internal testing builds
- Store submission per Section 23

---

## 21. ASSUMPTIONS REGISTER

Decisions the developer made where the client was silent. Each is safe, reversible, and small. Numbered so the client can overturn any of them with one sentence.

**A1, account deletion.** Required by Apple. Deletion anonymises rather than hard deletes, so historical reports keep their shape. Balances survive anonymised. The coach is not notified.

**A2, credit return after expiry.** A credit returned by a cancellation goes back to the subscription it came from even if that subscription has since expired. The credit is then voided by the expiry job like any other. Simpler than moving credits between subscriptions and it matches what a player would expect.

**A3, capacity reduction.** The app never auto-removes players when court count drops. It blocks the save and tells the coach to remove people first. Deciding who loses a spot is his call, not the algorithm's.

**A4, balance visibility.** The player does **not** see what he owes. The original decision was explicit that this is coach-only; the later instruction was ambiguous. Implemented as coach-only with a single config constant, `SHOW_BALANCE_TO_PLAYER = false`, so flipping it is a one line change plus a screen. **Confirm with the client before launch.**

**A5, custom rate on extended sessions.** Two fields, standard and extended, each independently overridable. A player set to 4 JD on standard sessions is not automatically 4 JD on the 8 JD Tuesday.

**A6, cancellation announcement prompt.** Cancelling a session sends no push, as instructed. Immediately afterwards the coach is offered a prefilled announcement composer, which does push. His choice, one tap, decision respected.

**A7, price snapshots.** Every booking stores the price it was made at. Changing a session's price never rewrites existing bookings.

**A8, effective dated costs.** Court, water, and coach costs are effective dated rather than overwritten, so historical profit reports never silently change.

**A9, payment method changes.** A player may change his own payment method until the 1 hour cutoff by cancelling and rebooking; there is no dedicated change flow. The coach can change any method during review.

**A10, email confirmation gating.** Confirmation is required to book, not to browse or sign in. There is no approval gate to catch unconfirmed accounts otherwise.

**A11, unrated players.** A player with no tier is treated as B by the engine and marked visually so the coach notices.

**A12, sit-out fairness.** Sit-outs are tracked within a session only. Nothing carries between sessions.

**A13, screenshot retention.** CliQ proofs are deleted after 365 days by a purge job. Long enough for any dispute, short enough to limit what a breach would expose.

**A14, assistant coach permissions.** An assistant coach sees Today and the court board, and nothing else. He cannot take payments, add players, or see reports.

**A15, seventh rotation.** Extended sessions generate 6 rotations. The coach may add a seventh manually from the court board, and it uses rule 1.

**A16, locale persistence storage.** Section 16.1 requires the chosen language to survive before login, and section 2.1's stack table names no storage library. `@react-native-async-storage/async-storage` is used, which is the mechanism CLAUDE.md already names for cache. Tokens will use `expo-secure-store` from phase 2, per CLAUDE.md. Added by the phase 0 agent under the section 0 rule 2 procedure.

**A17, Cairo font delivery.** Section 17.1 requires Cairo at weights 400 and 700, bundled via `expo-font`, but does not say where the files come from. `@expo-google-fonts/cairo` supplies them under the SIL Open Font License. Imported from its per-weight subpaths so only the two required faces enter the bundle rather than all nine. Added by the phase 0 agent under the section 0 rule 2 procedure.

**A18, expo-updates.** Section 2.1 states the project needs EAS Update, and switching language requires an app reload for `I18nManager.forceRTL` to take effect. `expo-updates` provides `reloadAsync()` for that restart, with a dev-only fallback. Added by the phase 0 agent under the section 0 rule 2 procedure.

**A19, one report view exists in phase 1.** Section 7.3's policy table has a
`Report views` row that is coach only, but section 6.3 defines no report view;
reports proper are phase 9. Phase 1's acceptance criteria require proving that
an admin can read everything *except* the report views, which needs a report
view to exist. `v_session_financials` was added: revenue per section 12.2, cost
from the instance's snapshot per 12.1, outstanding per 12.3, one row per
session, guarded with `WHERE is_coach()` so an admin reads zero rows. Phase 9
extends or replaces it. Added by the phase 1 agent under the section 0 rule 2
procedure.

**A20, a player can always read a session he has booked.** Section 7.3 grants
players SELECT on `session_instances` for "rows within the booking window and
not cancelled". Read literally that makes My Bookings (14.9), booking detail
(14.10), and the cancelled-session banner (14.7) impossible, because a player
could not read a session he himself had reserved. The policy is the section 7.3
predicate `OR EXISTS (a booking of his own on that session)`. It discloses
nothing he does not already know, and it does not widen what he sees *about*
that session, which is still governed by `get_session_attendees`. Added by the
phase 1 agent under the section 0 rule 2 procedure.

**A21, view security mode.** A Postgres view runs with its owner's rights by
default, which silently bypasses the RLS on the tables underneath it. The three
views in 6.3 therefore had to choose explicitly.
`v_player_credit_balance` and `v_player_total_balance` are
`security_invoker = true`, so a player sees his own subscriptions and no
balances at all. `v_session_occupancy` is deliberately left as a definer view:
section 14.6 states the count is not private at any visibility level, and a
player cannot read other people's bookings, so the count has to be computed
above his row access rather than through it. It exposes integers and a session
id and nothing else. Added by the phase 1 agent under the section 0 rule 2
procedure.

**A22, `@types/node` as a dev dependency.** The phase 1 integration suite reads
the local stack's URL and keys from the Supabase CLI rather than hardcoding
them, which needs `child_process` types. `@types/node` is a type-only dev
dependency and ships nothing into the app bundle, so it is not a section 2.1
stack addition. Added by the phase 1 agent under the section 0 rule 2
procedure.

**A23, assistant coach read access is phase 7.** A14 gives an assistant coach
Today and the court board. Section 7.3's policy table does not mention the role
at all, and `is_staff()` is admin or coach only, so today an assistant coach
reads exactly what a player reads. The court board read path is built with the
court board in phase 7. Recorded here so the gap is deliberate rather than
forgotten; `supabase/tests/staffAccess.test.ts` asserts where the boundary
currently sits.

**A24, `profiles.id` no longer references `auth.users`.** Section 6.2 declared
`id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`. Section
14.14 step 4 deletes the `auth.users` row, and A1 requires the profile and the
bookings, balance entries and credit history hanging off it to survive that
deletion anonymised. The cascade does the opposite: it deletes the profile, and
the cascades on `balance_entries`, `player_subscriptions` and
`credit_transactions` then destroy exactly the history A1 preserves. The
constraint is dropped in migration 0014. `profiles.id` still carries the same
uuid as `auth.uid()`, so every policy and helper written against it is
unchanged; what changes is that a profile may outlive its auth user, which is
what a deleted account is. Added by the phase 2 agent under the section 0 rule
4 procedure.

**A25, `profiles.phone` is nullable.** A1 nulls the phone on deletion. Section
6.2 declared it `NOT NULL` with a 9-to-15 digit CHECK, which leaves only a
fabricated number as the alternative — worse than absent, because it could
collide with a real one. Made nullable in migration 0014. Every live profile
still has one: 14.2 requires it at sign up and `handle_new_user` refuses to
build a profile without it. Added by the phase 2 agent under the section 0 rule
4 procedure.

**A26, the profile trigger keys on the phone.** `handle_new_user` reads the
five sign-up fields from `auth.users.raw_user_meta_data` and stands aside when
no phone is present. `supabase/seed.sql` inserts `auth.users` rows directly and
then writes its own `profiles` rows carrying roles, tiers and custom rates the
trigger knows nothing about; leaving the phone out of its metadata is how it
says so. Any other discriminator would have meant either editing the seed or
letting the trigger overwrite it. Added by the phase 2 agent under the section
0 rule 2 procedure.

**A27, an abandoned sign-up leaves an unconfirmed account behind.** 14.3's
*Change email* has no session to work with, so the address is changed by
registering the correct one; GoTrue cannot move an unconfirmed user's email
without one. The abandoned attempt keeps its `auth.users` row and its profile,
both unconfirmed. It can never sign in and holds no bookings. If the coach's
player list in phase 3 wants them gone, the filter is
`auth.users.email_confirmed_at IS NULL`. Added by the phase 2 agent under the
section 0 rule 2 procedure.

**A28, staff reach the account screens through More.** 14.0 puts Settings under
the admin *More* tab and 14.12 is written as a player screen, but a coach also
has to be able to sign out, and App Store guideline 5.1.1(v) does not exempt
his account from being deletable. The *More* tab is the profile stack until
phase 8 and 9 give it announcements and reports. Added by the phase 2 agent
under the section 0 rule 2 procedure.

**A29, the delete confirmation word is translated.** 14.14 requires the word
DELETE to be typed. Asking somebody on an Arabic keyboard to produce Latin
capitals is a barrier rather than a safeguard, and the safeguard is deliberate
typing. The Arabic deck asks for `حذف`; the comparison is case-insensitive and
trims, and each language accepts only its own word. Added by the phase 2 agent
under the section 0 rule 2 procedure.

**A30, the credits card on the profile is phase 6's.** 14.12 lists a "credits
summary card, tappable through to subscriptions" among the profile screen's
contents. Building it in phase 2 would mean building the credit balance query
and the subscriptions screen (14.13) it taps through to, both of which section
20 assigns to phase 6. Everything else in 14.12 shipped in phase 2; the card
lands with the screen behind it. Added by the phase 2 agent under the section 0
rule 2 procedure.

**A31, `current_date` is not Amman's today.** Section 5.1 requires every
business comparison to convert to Asia/Amman first. `current_date` reads the
database session's timezone, which on Supabase is UTC, and Jordan is UTC+3, so
for the three hours between 00:00 and 03:00 Amman it returns yesterday. Phase 1
wrote the player's 5 day window against it; during those three hours the
schedule showed a day that finished the previous night and hid the fifth day,
which is not "exactly 5 days". Migration 0016 adds `amman_today()` and rewrites
the `session_instances` select policy against it, and `generate_sessions` uses
it too. Nothing else changes: the A20 disjunct and the rest of the predicate are
untouched. The same substitution is owed to `create_booking`'s
`current_date + interval '4 days'` guard when phase 4 writes it. Added by the
phase 3 agent under the section 0 rule 2 procedure.

**A32, generation keys on the template and the date, not on the start time.**
Section 8.1 step 2 says to insert an instance "if one does not already exist for
that `(venue_id, starts_at)`". D7 lets the coach move a single dated instance to
a different time without touching the template. Read literally the two
contradict each other: once he has moved Saturday's 19:00 session to 19:45, the
next nightly run finds nothing at 19:00 and helpfully creates a second session
there, and cancelling one would do the same. `generate_sessions` therefore skips
a `(template_id, session_date)` pair that already has a row, whatever its time
or status. The unique constraint on `(venue_id, starts_at)` is still enforced
underneath by `ON CONFLICT DO NOTHING`, so 8.1's rule still holds — it is now
the second line of defence rather than the first. Added by the phase 3 agent
under the section 0 rule 2 procedure.

**A33, four error codes Appendix A does not list.** The staff session RPCs raise
`not_authorized` (a non-staff caller), `session_time_taken` (a unique violation
on `(venue_id, starts_at)`, which 15.4 and 15.6 can both provoke),
`invalid_duration`, `invalid_court_count`, `invalid_price` and `venue_not_found`
(arguments outside what D5 and section 6.2 permit). Appendix A covers the
booking and review paths and predates these three functions existing. Each has a
string key in the `admin.error` namespace in both decks. Added by the phase 3
agent under the section 0 rule 2 procedure.

**A34, the eighth state of 14.7 is `ended`.** Section 14.7's primary action
table has seven rows; 19.1 requires a component test proving the button "matches
the state table in Section 14.7 for all eight states". The enumeration in
`src/features/sessions/sessionState.ts` names eight, and the missing one is a
session that is over. It is unreachable from the player schedule, which hides
finished sessions (5.2), but reachable from My Bookings, which 14.9 keeps
showing for 30 days and 14.10 gives a cancel button "subject to the window".
Without it the enumeration is not total and a finished session would offer
*Cancel my reservation*. The seven rows also overlap, so they are given a
precedence rather than a lookup; the reasoning for each step is in that file.
Added by the phase 3 agent under the section 0 rule 2 procedure.

**A35, the coach types a date rather than picking one.** 15.6 asks for a date on
the one-off session form. Every date picker for React Native is a native
dependency, and section 2.1's stack table lists none. The field takes a typed
`yyyy-MM-dd`, validated by the form schema, on a screen the coach uses a handful
of times a season. If the client wants a picker, `@react-native-community/
datetimepicker` is the Expo-supported one and it is a section 2.1 amendment
rather than a code decision. Added by the phase 3 agent under the section 0 rule
2 procedure.

**Closed, phase 10.** The client approved the amendment; see 2.1 and
OPEN-ITEMS.md. `DateField`/`FormDateField` (`src/components/primitives/`) wrap
it and are used on 15.6's create form, 15.9's grant form, and the extend sheet.

**A36, `@shopify/flash-list` arrives with the admin schedule.** Section 2.1
lists it for "any list that can exceed 20 rows". The player schedule is five
days of a twelve-session week — about ten cards and five headers — and stays on
`SectionList`, which gives 14.6's sticky day headers without a flattening pass.
15.3's thirty days is roughly fifty cards plus thirty headers, so that one uses
FlashList over a flat array of tagged rows. It is a native dependency and needs
a new dev build. Added by the phase 3 agent under the section 0 rule 2
procedure.

**A37, two payment methods `create_booking` refuses.** Section 8.2's signature
takes any `payment_method`. Two of the four must not reach it from a player's
phone. `free` is staff-only: 10.1 assigns it to guests and coach slots (D45,
D47), and a player who could ask for it would book for nothing. `cliq` is
refused for now because 10.1 states that "a booking must never exist with
`payment_method = 'cliq'` and no proof row", and the upload, the storage policy
and the proof row are all phase 5 — so until then that path can only create the
state 10.1 forbids. The sheet disables the option with a line saying so, and
the function raises `payment_method_not_allowed` and `cliq_unavailable`
respectively. Phase 5 removes the second guard when it adds the proof; the
first one stays. Added by the phase 4 agent under the section 0 rule 2
procedure.

**A38, 9.1's order wins over 8.2's.** Section 8.2 gives working code for
`create_booking`; section 9.1 gives a nine row table and says "evaluate in this
order and return the first failure". They disagree twice: 8.2 checks the 1 hour
cutoff before the 5 day window, and the deleted account before the email, while
9.1 has each pair the other way round. 9.1 is the section that states an order
as a requirement rather than incidentally, so it is the one implemented. The
pair that a player will actually hit is `already_booked` before `session_full`:
rebooking a session he is already in should tell him he is already in it.
`supabase/tests/createBooking.test.ts` asserts that case explicitly. Added by
the phase 4 agent under the section 0 rule 2 procedure.

**A39, `notify_waitlist` stamps rather than sends.** Section 8.4 step 4 says to
"insert a push job row for each, then call the send-push edge function". Section
6 defines no push job table, and section 20 puts token registration, `send-push`
and dead token pruning in phase 8. The function therefore implements steps 1, 2,
3 and 5 — the cutoff, the capacity check, the selection and `notified_at` — and
returns how many entries it stamped, so a test can tell "nobody was told" from
"the function was never called". Phase 8 sends to exactly the set this marks.
What phase 4 owes is D28's silence, and that is tested at 40 minutes and again
at 61. Added by the phase 4 agent under the section 0 rule 2 procedure.

**A40, `mark_lineup_stale` discards, and phase 7 regenerates.** Section 8.2
calls it and 13.8 describes what it should do: while `has_manual_lineup` is
false, any booking change "discards and regenerates the whole lineup
automatically". The generator is a pure TypeScript module that runs on the
coach's phone (13.1), so Postgres cannot call it. The function deletes the
session's rotations when the coach has made no manual edit, and leaves them
alone when he has. The court board then loads, finds nothing, and generates —
which is what "discards and regenerates" describes, one step later. Locked
courts and pairing rules are untouched by either branch: 13.8 makes them inputs
to generation rather than results of it. Added by the phase 4 agent under the
section 0 rule 2 procedure.

**A41, joining a waiting list and leaving one are RPCs.** Section 7.3's policy
table gives a player insert and delete on his own `waitlist_entries` rows,
"subject to RPC", and section 8 defines no such function. 9.5 carries rules a
policy cannot express — already booked is rejected with `already_booked`, and
D28's cutoff makes a list that can no longer be called one there is no point
joining — so `join_waitlist` and `leave_waitlist` were added alongside
`notify_waitlist`. Leaving stamps `left_at` rather than deleting the row, which
is what that column is for and what keeps the record of who was waiting when a
spot opened. Added by the phase 4 agent under the section 0 rule 2 procedure.

**A42, a paid guest is marked paid.** D45 lets a guest booking be "paid (with
an amount) or free (zero)" without saying what `payment_status` a paid guest
carries at the moment he is added. He is marked `paid`, matching D43's
treatment of a registered player added without credits — "created as cash and
marked paid, editable during review" — because both are the same situation: the
coach is standing next to the person and adding him. The review screen (10.2)
is where either is corrected. A guest added at zero is `waived`, per 8.5's rule
that `expected_fils = 0` is never a balance entry. Added by the phase 4 agent
under the section 0 rule 2 procedure.

**A43, adding a coach writes two rows, and removing him removes both.** D47
gives an assistant coach a court slot he pays nothing for; D76 charges 10 JD
for the night he works. Those are different things with different lifetimes —
one per session, one per venue and date — so `admin_add_coach` writes a booking
and a `session_coaches` row, and `admin_remove_booking` deletes the
`session_coaches` row when the booking it removes is a coach slot, then
recomputes the night. Without the second half, removing a coach from a session
would leave the academy paying for a night he is no longer on. 15.2's picker
also lists the head coach, not only `role = 'assistant_coach'`, because D47
names "the coach and assistant coaches". Added by the phase 4 agent under the
section 0 rule 2 procedure.

**A44, the row gesture in 15.2 is a tap.** 15.2 asks for "swipe or long press a
row" to reach *Remove*, *Change tier* and *Move to another session*. A swipe
needs `react-native-gesture-handler`, which section 2.1 admits for the court
board and phase 7 brings in, and a long press is invisible to a screen reader.
A tap opening the confirmation is the same number of deliberate actions — 17.4
requires the confirmation either way — and works today. If the gesture matters
to the client it becomes a swipe in phase 7 at no cost, since the confirmation
it opens is already built. Added by the phase 4 agent under the section 0 rule
2 procedure.

**Phase 10 update.** With a second action built (*Move to another session*,
D81), the tap now opens `RowActionsSheet` — a small menu of full-size, screen
reader-visible buttons — rather than jumping straight to `RemoveBookingDialog`.
The count of deliberate actions this note argues for is unchanged: one tap to
open, one to choose, one to confirm, exactly what a swipe followed by a
confirmation would have cost.

**A45, the booking id is reserved before the screenshot is uploaded.** 10.1
step 5 names the object `payment-proofs/{user_id}/{booking_id}.jpg` and step 6
says `create_booking` "is called only after the upload succeeds". Both cannot
hold if the id is minted by the insert: the path needs an id that does not
exist yet. `prepare_cliq_booking(session)` therefore runs every section 9.1
rule and returns a fresh uuid without writing anything, the client uploads
under that name, and `create_cliq_booking(...)` re-runs every rule under the
session lock and writes the booking and its proof in one transaction. The uuid
comes from Postgres rather than the phone because Hermes has no global crypto
and one string does not justify another native dependency. Reserving is not
holding: the last spot can still go while the photo uploads, in which case
`session_full` is raised and the orphaned object is swept by the purge (A48).
Added by the phase 5 agent under the section 0 rule 2 procedure.

**A46, 10.1's rule is enforced by the database, not by convention.** "A booking
must never exist with `payment_method = 'cliq'` and no proof row" is a claim
about the data, so a deferred constraint trigger on `bookings` checks it at
COMMIT: a CliQ booking with no `payment_proofs` row aborts the transaction,
whoever wrote it. It fires on INSERT only, because 10.2's *Change method*
legitimately moves an existing booking onto CliQ when a player paid that way in
person and there is no screenshot anywhere in that story. Two consequences
worth knowing: a CliQ booking cannot be created through PostgREST in two
requests, since each commits on its own, and `supabase/seed.sql` now writes a
proof row for every historical CliQ booking it generates. Added by the phase 5
agent under the section 0 rule 2 procedure.

**A47, `create_booking` still refuses CliQ, with a new code.** A37 refused it
as `cliq_unavailable` because the proof did not exist yet, and said phase 5
would remove the guard. The guard stays and its meaning changes: CliQ now has
somewhere else to go, and this entry point cannot attach a proof, so letting it
through would produce exactly the state A46's trigger aborts. The code is now
`cliq_requires_proof`. A37's first half, `free` being staff-only, is unchanged
and permanent. Added by the phase 5 agent under the section 0 rule 2 procedure.

**A48, a credit booking cannot change payment method.** 10.2 lists *Change
method* among the row actions without saying which methods it moves between.
Cash, CliQ and free interchange freely. Credit does not, either way: moving a
booking off credit would strand the `-1` transaction that paid for it, and
moving one onto credit would need a subscription chosen and a ledger row
written, which is 8.2's job and not 8.5's. `record_payment` raises
`credit_change_not_supported` and the review screen offers no *Change method*
on a credit row at all. The coach's route is 10.2's own *Remove from session*,
which returns the credit, followed by adding him again. Added by the phase 5
agent under the section 0 rule 2 procedure.

**A49, an underpaying guest gets no balance entry.** 8.5 says a partial payment
inserts a `balance_entries` row for the difference. `balance_entries.player_id`
is NOT NULL and a guest has no account, because D44 and D46 make him a name and
a tier that are not remembered. He therefore gets his `payment_status` and no
entry: there is nowhere to put the debt and nobody to collect it from, and
inventing somewhere would be inventing the guest history section 4 item 12
forbids. The coach knows who the guest was; the app deliberately does not. The
same holds for a coach slot, which expects nothing anyway (D47). Added by the
phase 5 agent under the section 0 rule 2 procedure.

**A50, `record_payment` never rewrites the price, except to waive it.** A7
makes `expected_fils` a snapshot taken at booking, and a method change does not
touch it. The one exception is `free`, because 10.1's table defines free as
expecting nothing — choosing it *is* the act of waiving the amount — so the
price goes to zero, the status becomes `waived`, and the row's balance entry
goes with it. Moving a free row back to cash does not restore a price; the
coach removes and re-adds, which is the same route A48 names. Added by the
phase 5 agent under the section 0 rule 2 procedure.

**A51, removing a booking removes the balance entry it created.** 9.3 is
explicit that "the app never creates a balance entry from a cancellation", and
10.3 that an entry is created only by `record_payment` and only from the review
screen. Neither says what happens to an existing entry when the booking behind
it is removed. `admin_remove_booking` deletes it: the debt was for a place in a
session the coach has just decided this person did not have, and leaving it
behind would create a balance entry from a cancellation by omission. A manual
entry, which carries no `booking_id`, is untouched. Added by the phase 5 agent
under the section 0 rule 2 procedure.

**A52, the 7 day lock binds on the deadline, not on the cron job.** D39 has two
halves and only one of them is a status. "The review window is 7 days from
session end" is a fact about the clock; `status = 'locked'` is a fact about
whether 8.6's 03:10 job has run yet. Between the window closing and the job
firing, a session is over its deadline and still says `pending_review`, and a
status check alone would let mutations through for those hours.
`assert_session_unlocked` checks both, so every staff mutation — record a
payment, confirm, reopen, add, remove, edit, cancel — is refused from the
moment the deadline passes. The job still runs, and is what makes the state
visible to a reader and to the review screen's read-only banner. The client
computes the same thing the same way in `features/payments/reviewState.ts`, so
the screen never offers a control the server would refuse. Added by the phase 5
agent under the section 0 rule 2 procedure.

**A53, the review footer is staff-visible; the report view stays coach-only.**
10.2 requires "the session's cost and profit" in the review screen's footer, and
D16 gives an admin the review screen. A19's `v_session_financials` is guarded
with `WHERE is_coach()` per D73, so an admin reads nothing from it. The same
arithmetic for one session at a time is therefore exposed as
`get_session_money_summary(session)`, gated on `is_staff()`. D73's "reports" is
the Reports tab in 15.12, not the bottom of the screen an admin is standing in
the gym using; the month-wide view that phase 9 builds stays coach-only. Added
by the phase 5 agent under the section 0 rule 2 procedure.

**A54, the proof purge cannot live in `pg_cron`.** 8.6 schedules the daily
04:00 purge in Postgres and says to delete the storage objects first. Storage
refuses: `storage.protect_delete` raises on any DELETE against
`storage.objects` that does not come through the Storage API, whatever role
issues it — "This prevents accidental data loss from orphaned objects". The
work is split exactly as `delete-account` already splits it (8.7, A1):
`purge_payment_proofs()` retires the rows past `purge_after` and returns their
paths, plus any object left unclaimed for more than a day by a CliQ booking
that failed after its upload (A45), and the edge function
`purge-payment-proofs` hands those paths to the Storage API. There is one
deleter of rows, so a path can never be retired without something being told to
remove the object behind it. The order is rows-then-objects rather than 8.6's
objects-then-rows, for the reason `delete-account` gives for the same
inversion. **What is not wired: the daily invocation.** It is a deployment step,
not code, and it is recorded in OPEN-ITEMS.md. Nothing is at risk before
August 2027, since A13's retention is 365 days and the app has not launched.
Added by the phase 5 agent under the section 0 rule 2 procedure.

**A55, `expo-clipboard`.** 14.8 requires a copy button beside the CliQ alias
and section 2.1's stack table names no clipboard library. React Native removed
`Clipboard` from core, so `expo-clipboard` is the only supported route on a
managed Expo project and it is what `expo install` resolves. `expo-image-picker`
and `expo-image-manipulator` were already in 2.1 for exactly this flow. Added by
the phase 5 agent under the section 0 rule 2 procedure.

**A56, eight error codes Appendix A does not list.** `session_not_in_review`,
`session_not_confirmed`, `invalid_amount` and `credit_change_not_supported`
come from the review functions, which Appendix A predates.
`cliq_requires_proof`, `proof_path_mismatch`, `proof_required` and
`booking_not_found` come from the CliQ path. Each has a key in the
`admin.error` or `payment` namespace in both decks; the four that are
unreachable from the UI, which offers only the actions that work, map to the
generic message a crafted call deserves. Added by the phase 5 agent under the
section 0 rule 2 procedure.

**A57, the admin player profile is two of 15.8's eight sections.** Phase 5
creates balance entries and section 20 assigns 15.8 to no phase at all, so a
debt the coach could never see or settle would be half a feature. Sections 1
(identity) and 6 (balance, per 10.3) are built, reached by tapping a name on
the review screen — where the debt was created. Sections 2, 3, 4, 7 and 8 are
recorded in OPEN-ITEMS.md; section 5 is phase 6, which also brings 15.7's
filterable player list and gives the screen its second way in. The player's own
email is not shown: `profiles` carries no email column and `auth.users` is not
readable from the client, so 15.8 section 1's email waits for a staff-only RPC
if the coach turns out to want one. Added by the phase 5 agent under the
section 0 rule 2 procedure.

**A58, only the coach extends; an admin may grant and adjust.** D16 gives an
admin everything the coach has except reports, and its list of examples names
"granting subscriptions". D55 is written about one action and is narrower:
"Only the coach extends a subscription, manually, and only before it expires."
A list of examples does not overrule a decision about the very action in
question, so `grant_subscription` and `adjust_credits` are gated on
`is_staff()` and `extend_subscription` on `is_coach()`. 11.2 agrees for the
first ("Coach or admin, from the player profile") and 11.5 agrees for the last.
The *Extend* button is drawn only for the coach, so an admin is never offered a
control the server would refuse. To overturn: one sentence, and one line —
`is_coach()` becomes `is_staff()` in migration 0029. Added by the phase 6 agent
under the section 0 rule 2 procedure.

**A59, adjusting credits may not take a balance below zero.** 15.10's preview
is "Balance goes from 40 to 27" and 11.3's flow subtracts from a grant that
covers it. Neither says what a −6 balance would mean. Nothing in the
specification describes one: `pick_subscription` wants `remaining > 0` so it
cannot be spent, the expiry job would have to *add* credits to zero it, and a
negative number on 14.13's screen would be a debt in the one place D40 keeps
debts out of. `adjust_credits` raises `insufficient_credits`. A coach who has
over-corrected adjusts upwards; a coach recording money owed uses a balance
entry (10.3), which is the table for it. Adjusting a voided subscription is
refused for the neighbouring reason: expiry closes that ledger at exactly zero
(11.5), and reopening it would produce credits that are visible and
unspendable. Added by the phase 6 agent under the section 0 rule 2 procedure.

**A60, 15.7's player list is phase 6's, because 15.9 and 15.10 need a way in.**
Section 20 assigns 15.7 to no phase. 14.0 assigns it a place: it is the root of
the Players stack, `PlayerList → PlayerProfile → GrantSubscription →
AdjustCredits`, and the last two are this phase's. Phase 5 gave the player
profile one other route — tapping a name on the review screen — but the people
11.3's migration exists for are mid-subscription *today* and need not appear on
any recent review screen. Without the list, the flow this phase is measured by
cannot be reached for exactly the players it is for. Built as 15.7 describes:
search, the four filters, the three sorts, all of them server side in
`search_players`, because two of the filters are sums over other tables.
Added by the phase 6 agent under the section 0 rule 2 procedure.

**A61, seven error codes Appendix A does not list.** `player_not_found`,
`package_not_found`, `invalid_visit_count` and `invalid_expiry` come from
`grant_subscription` and `extend_subscription`; `note_required`,
`insufficient_credits` and `subscription_voided` come from `adjust_credits`.
Appendix A predates all three functions and already lists
`subscription_expired`, which is the one the coach can actually provoke. Each
has a key in the `admin.error` or `validation` namespace in both decks; the
ones a well-behaved screen cannot reach map to the generic message a crafted
call deserves. Added by the phase 6 agent under the section 0 rule 2 procedure.

**A62, six error codes for the court board's writes.** `court_locked` and
`court_not_full` are the two the coach can provoke: 13.9 requires a toast when
a swap touches a locked court, and 13.4 rule 3 means a singles court has no
four players to lock. Both have keys in the `admin.board.error` namespace in
both decks. `rotation_not_found`, `assignment_not_found`, `invalid_lineup` and
`same_player` are shapes the board cannot produce and a crafted call can, so
they map to the generic message. Added by the phase 7 agent under the section 0
rule 2 procedure.

**A63, the court board's writes are RPCs, and 0033 is where they live.**
Section 8 lists the server side functions and stops before the lineup; 0012
gives staff `FOR ALL` on `rotations`, `court_assignments`, `rotation_sitouts`
and `locked_courts`, so a client could in principle write them directly.
`save_lineup` replaces four tables' worth of rows at once and 13.9 requires a
swap to write immediately, so both are single transactions on the server rather
than a sequence of round trips: a board that is half of the old lineup and half
of the new one is one the coach reads five names off a court from.
`count_lineup_changes` is there for the same reason 13.8's banner needs a
number. Added by the phase 7 agent under the section 0 rule 2 procedure.

**A64, locking a court governs the next generation, not this one.** 13.9 says a
locked court "is excluded from all future generation" and 13.4 rule 3 says it
keeps its four players "in every rotation". Read together they would have a
long press rewrite the five rotations already on screen. It does not: `lock_court`
records the four players on that court in the rotation the coach is looking at
and leaves every rotation alone. A lock that rewrote the board would be a
regeneration wearing a padlock, and 13.8 gives that power to one button, which
asks first. Added by the phase 7 agent under the section 0 rule 2 procedure.

**A65, a resting player's tile is a player tile.** 13.9 says "drag a player tile
onto another player tile to swap them" and 13.10 puts the sit-outs in a section
of their own. Both readings are available; the board takes the literal one, so a
swap may exchange somebody on court with somebody resting. Section 4 item 17
rules out late arrival and early departure handling, and this is neither: it is
the coach deciding who sits this rotation, which is the same decision the engine
made for him. Added by the phase 7 agent under the section 0 rule 2 procedure.

**A66, the push outbox is two tables.** Section 8.4 step 4 says to "insert a
push job row for each, then call the send-push edge function". Section 6
defines no push job table, so `push_jobs` and `push_deliveries` were added and
are recorded in section 6.2 and in section 7.3's policy table.

`push_jobs` is the outbox: one row per event section 18 permits, with the
audience frozen at enqueue time and the payload captured with it, so a session
whose time the coach edits after a spot opened does not change a notification
already on its way. `push_deliveries` is one row per token a job was sent to,
and it exists for one sentence in section 18: "dead tokens returned by Expo's
receipt API are deleted". A receipt names a *ticket*, not a token, and Expo
advises waiting minutes before asking for one, so the ticket-to-token mapping
has to outlive the request that created it. Without the second table a receipt
is unactionable.

`push_job_kind` has exactly two values, which is how D70 is enforced rather
than merely intended: a booking confirmation, a reminder, a cancellation or an
expiry warning cannot be enqueued, because there is nothing to enqueue it as.
The two writers of the table are `notify_waitlist` and `publish_announcement`,
both in migration 0035, and there is no third. Added by the phase 8 agent under
the section 0 rule 4 procedure.

**A67, `send-push` is a drain, not a courier.** Section 8.7 describes it as
taking "a list of player ids and a payload". It deliberately does not. Its
caller is an ordinary signed-in phone — the coach who has just published
(15.11), or the player whose cancellation freed a spot (8.3 step 7) — and a
phone that could name its own audience could push anything to anyone. The
request body carries nothing but an optional batch size; the function claims
whatever the database has decided to send, resolves each job's devices itself,
and sends that.

The consequence worth stating: D28's one hour rule is not enforced in the edge
function. `notify_waitlist` enqueues nothing when a spot opens inside the last
hour, so there is nothing for a drain to find, and no request to the function
can produce a notification the database did not already write down. Three error
codes come with the announcement RPCs and are listed in Appendix A:
`invalid_announcement_body`, `invalid_language` and `announcement_not_found`.
Added by the phase 8 agent under the section 0 rule 2 procedure.

**A68, four notification strings and one time format live in the edge
function too.** Section 18 requires the payload's language to come from the
device row, which puts both languages on the server; the string deck lives on
the phone, and importing it into Deno reaches outside the directory the
Supabase CLI mounts, so it would not survive a deploy.
`supabase/functions/_shared/pushStrings.ts` therefore holds a second copy of
the four `notifications` entries, and `_shared/ammanTime.ts` a second
implementation of 16.1's 12 hour format — which needs no date library because
5.1 fixes Jordan at UTC+3 with no daylight saving.

What makes the duplication safe rather than a 16.1 violation is a test:
`src/features/notifications/__tests__/pushStrings.test.ts` asserts the table is
character for character the `notifications` namespace of both decks, and that
the time format agrees with `src/lib/time.ts` at every half hour of a day, in
both languages. Edit either side and the suite fails. Added by the phase 8
agent under the section 0 rule 2 procedure.

**A69, permission is asked for once, and the token is registered on the yes.**
Section 18 has two sentences that pull against each other in practice: tokens
are "registered on login and refreshed on every cold start", and permission is
"requested contextually, the first time the player joins a waiting list, not on
first launch". A cold start is first launch for anybody who has not joined a
list yet, so `acquireDeviceToken` checks the permission and never asks for it —
which means a player who never joins a waiting list has no token and receives
no announcement push either. That is what section 18 asks for, stated plainly.

The moment he does grant permission is the first moment the phone can produce a
token, and the cold-start effect will not try again until the next launch, so
the join flow registers it immediately on a yes. Waiting would mean missing the
spot he joined the list for. Added by the phase 8 agent under the section 0
rule 2 procedure.

**A70, the More tab's root is the announcement list.** 14.0 gives the staff
More tab the stack "Announcements → Reports [coach only] → Settings". A28 made
it the profile stack in phase 2 "until phase 8 and 9 give it announcements and
reports", and this is that: 15.11's list is the root, the composer and the
detail view sit behind it, and 14.12's profile — where a staff account signs
out and deletes itself — is one tap in from a *Settings* button on the list.
Account deletion therefore stays inside the three taps App Store guideline
5.1.1(v) allows (23.3). Added by the phase 8 agent under the section 0 rule 2
procedure.

**A71, a waitlist notification has no destination on the staff side.**
Section 18 deep links a waitlist push to session detail, which is 14.7 — a
player screen. A staff account reaches a session through 15.2 instead, which is
a different screen showing different things. Rather than send a coach somewhere
the notification is not about, that combination opens nothing and the app stays
where it was. An announcement push works on both sides, landing in 14.11's tab
for a player and in the More stack for staff. Added by the phase 8 agent under
the section 0 rule 2 procedure.

**A72, a month's report covers the sessions that have started.** 15.12 gives
the report a month picker and does not say which sessions in that month it
counts. Every figure in it — revenue, cost, occupancy, the per-session table —
is drawn from sessions whose `session_date` falls in the Amman month, whose
status is not `cancelled`, and which have started. The last clause matters only
for the month the coach is standing in: a session tonight at 21:00 already
carries a cost snapshot, because the rent is committed (12.1), and cannot have
taken a fils yet, so counting it would show the current month as a loss until
its last session had run. Cancelled sessions are excluded from revenue, cost
and occupancy and counted on their own line, because `recompute_night_costs`
redistributes their share of the night's rent across the sessions that did run.
Added by the phase 9 agent under the section 0 rule 2 procedure.

**A73, section 8 reports two different outstanding figures.** 15.12 section 8
says "Total owed, with the top ten debtors" under a month picker, and a debt is
not a monthly quantity: a player who has owed 8 JD since March still owes it in
May. So the report gives both. "Total owed to date" is the balance ledger as it
stands, which is what the coach chases and what the ten names are ordered by;
"unpaid from this month" is the month's own figure, and it is the one 12.3 adds
to profit to reach "profit if all outstanding is collected". Each debtor's row
shows how much of his total this month created. Added by the phase 9 agent
under the section 0 rule 2 procedure.

**A74, averages are divided on the client, from two integers.** 15.12 asks for
"average occupancy" in section 2, "average fill" in section 5 and "fill rate"
in section 6. The report functions return attendance and capacity as integers
and never a ratio, and the single division lives in
`src/features/reports/aggregate.ts`, so the three cannot come to mean three
different things. A slot that did not run has no fill rate rather than a rate
of zero, and renders as a dash: a dying slot and a slot that was not held are
different facts, and telling them apart is what section 5 exists for. Section 5
groups by template and therefore leaves out one-off sessions (15.6), which are
not a recurring slot; they remain in section 6 and in every total. Added by the
phase 9 agent under the section 0 rule 2 procedure.

**A75, "sold this month" is granted this month, valued at the snapshotted
rate.** D49 and D50 keep subscription money outside the app entirely, so the
only date section 7 can use is the grant. Its value is `granted_visits ×
per_visit_fils` rather than the package price, because 11.2 lets the coach
override the visit count and 11.1 snapshots the rate. "Credits used" nets
refunds and session cancellations off the bookings, since 9.3 says a cancelled
credit booking consumed nothing. Added by the phase 9 agent under the section 0
rule 2 procedure.

**A76, the Reports route exists for every staff account.** 15.12 says an admin
opening the tab "sees a permission denied state, and the API refuses the query
as well", which requires the tab to open. The route is registered in the More
stack for all staff and its button is shown to all staff; the refusal comes
from the eight functions in migration 0036, each of which raises
`not_authorized` unless `is_coach()`. Hiding the button would move D73's
boundary out of the database and into a navigator, and would replace a stated
answer with a missing one. Added by the phase 9 agent under the section 0 rule
2 procedure.

**A77, `@sentry/react-native` is a section 2.1 addition that 23.4 already
made.** Section 2.1's stack table is the list of libraries the project may use
and it does not name Sentry; section 23.4 says "Sentry for crashes and
unhandled promise rejections" and section 20 makes "Sentry wired" a phase 10
deliverable. Appendix B rule 2 prefers prose over silence, and there is no way
to satisfy 23.4 without the SDK. `expo install` resolves it to the version that
matches the SDK rather than the newest, and its config plugin is what installs
the native crash handlers. Added by the phase 10 agent under the section 0 rule
2 procedure.

**A78, what Sentry may collect is a list, not a default.** 23.4's two sentences
pull in opposite directions: the first asks for crash reporting, the second
forbids "analytics SDK… tracking… advertising identifiers". Sentry's defaults
sit on the wrong side of that line — session tracking, performance spans,
screenshots and view hierarchies are all on unless turned off, and a minor
version could turn one back on without anybody editing a line. So every one of
them is set explicitly in `src/lib/monitoring.ts` and asserted in
`src/lib/__tests__/monitoring.test.ts`, which makes the options object the place
the boundary is written down.

Three consequences worth stating. No user is ever put on the Sentry scope, so a
report carries a stack and not a name. Navigation breadcrumbs have their data
stripped, because the route params in this app are booking, player and session
ids. And a development build initialises but does not send: a developer's stack
traces are not the academy's to store. Added by the phase 10 agent under the
section 0 rule 2 procedure.

**A79, the root error boundary is an error state, not a crash handler.** 19.3
item 6 requires every screen to have a reachable error state, and every screen
has one for the read that failed. None of them covers a component that throws
while rendering, which in a release build is a blank screen — no message, no
retry, and no way to reach the coach, which D72 says there always must be.
`AppErrorBoundary` renders the same `ErrorState` every screen uses, with its
WhatsApp button, and reports the throw. It sits inside `ThemeProvider` and
`I18nextProvider`, because its fallback is themed and translated, and outside
everything that can throw. Added by the phase 10 agent under the section 0 rule
2 procedure.

**A80, the Arabic permission strings are a `locales` map, and RECORD_AUDIO is
blocked.** 23.3 requires the camera and photo library usage strings "in both
languages". An Expo config plugin takes one string per key and cannot express
two, so the second language goes in `assets/locales/ar.json` and reaches iOS
through the config's `locales` field, which writes an `InfoPlist.strings` under
an `.lproj` directory — the only place iOS looks for a translated system
prompt. `CFBundleAllowMixedLocalizations` is set with it, because iOS picks the
string by *device* language and Arabic is the app's default (16.1) but need not
be the phone's.

The same pass found `expo-image-picker` adding `android.permission.RECORD_AUDIO`
by default, because a picker can pick video. This app picks one still image in
one flow (10.1) and records nothing, and 23.3's data safety form has to be able
to say so, so `microphonePermission: false` both drops the permission and blocks
anything else from adding it back. Added by the phase 10 agent under the section
0 rule 2 procedure.

**A81, a production build refuses to start without its Supabase values.**
`EXPO_PUBLIC_*` values are inlined at build time (2.5), so one missing from the
EAS `production` environment produces a signed binary that cannot reach the
database and looks fine until it is launched — after `eas submit`, which is the
expensive place to find out. `src/lib/config.ts` throws at module load when
`EXPO_PUBLIC_ENVIRONMENT` is `production` and either Supabase value is empty,
naming the variable and the environment. A development build is untouched: a
developer who has just cloned the repository has no `.env`, and the test suite
runs that way. Added by the phase 10 agent under the section 0 rule 2
procedure.

**A82, 16.3's CI is a GitHub Actions workflow.** 16.3 states that "CI fails if
they diverge" and section 19 assumes a CI exists throughout, but no file in the
repository ran anything. `src/i18n/__tests__/keyParity.test.ts` had been the
check since phase 0 and nothing invoked it outside a developer's terminal.
`.github/workflows/ci.yml` runs the deck parity suite first, then 19.3's other
three gates — typecheck, lint, tests — plus a formatting check, on every push to
`main` and every pull request. The integration suite is deliberately not in it:
19.1 scopes it to a local Supabase stack, which needs Docker. Added by the phase
10 agent under the section 0 rule 2 procedure.

**A83, the store paperwork lives in the repository.** 23.3 lists a privacy
policy, a Play data safety form, screenshots and listing copy, and none of them
is code. They are in `store/`, in both languages where 23.3 asks for both, so
the submission is a matter of copying rather than composing — and so that a
future change to what the app collects can be checked against a file rather than
against somebody's memory of a form. `store/play-data-safety.md` in particular
is written as the answers, with the decision that justifies each one beside it.
What is not there is a *hosted* URL, which needs somewhere to host it; that is
recorded in OPEN-ITEMS.md alongside section 24 question 8, which needs the same
host. Added by the phase 10 agent under the section 0 rule 2 procedure.

---

## 22. SEED DATA

`supabase/seed.sql`. Run against dev; run the venue, cost, package, and template portions against prod.

**Venues**

```sql
INSERT INTO venues (name_en, name_ar, area_en, area_ar, court_count, display_order) VALUES
('International Independent Schools', 'مدارس الاستقلالية الدولية', 'Khalda', 'خلدا', 4, 1),
('Al-Ra''ed Al-Arabi School', 'مدرسة الرائد العربي', 'Shmeisani', 'الشميساني', 3, 2);
```

**Templates.** Twelve rows exactly as tabulated in Section 3.1. Weekday integers: Sunday 0, Monday 1, Tuesday 2, Wednesday 3, Thursday 4, Friday 5, Saturday 6.

**Night costs**, effective from 2026-08-01:

| Venue | Weekday | Cost |
|---|---|---|
| Khalda | Saturday (6) | 60000 |
| Khalda | Monday (1) | 50000 |
| Khalda | Thursday (4) | 60000 |
| Khalda | Friday (5) | 30000 |
| Shmeisani | Sunday (0) | 47500 |
| Shmeisani | Tuesday (2) | 35000 |
| Shmeisani | Wednesday (3) | 47500 |
| Shmeisani | Friday (5) | 22500 |

**Consumables:** standard 1250, extended 2500. **Coach fee:** 10000 per day.

**Packages:** the five rows from Section 11.1.

**Dev only:** one coach, two admins, one assistant coach, and 40 players spread across all nine tiers with a realistic distribution (more B and C than A), a handful with custom rates including one at zero, five with active subscriptions at various depletion levels, and two months of past sessions with mixed payment outcomes so the reports have something to show.

---

## 23. DEPLOYMENT AND STORE SUBMISSION

### 23.1 Environments

| Environment | Supabase | Distribution |
|---|---|---|
| Development | `pob-dev` | Expo Go and dev builds |
| Production | `pob-prod` | TestFlight, then App Store and Play Store |

No staging. The project does not warrant a third environment.

### 23.2 Release checklist

- Version bump in `app.config.ts`, build number incremented
- `eas build --profile production --platform all`
- Migrations applied to prod before the build is submitted, never after
- Smoke test on a physical device of each platform against prod
- `eas submit`

### 23.3 Store requirements

- **Account deletion** must exist in-app and be reachable in under three taps from the profile. Guideline 5.1.1(v). Already specified in 14.14.
- **Privacy policy URL**, hosted, listing what is collected: name, email, phone, payment screenshots, device tokens
- **Data safety form** on Play: personal info collected, not shared with third parties, deletable
- Screenshots in both Arabic and English, for both phone sizes
- Age rating 4+
- Category: Sports
- Push notification usage description, and camera and photo library usage strings in both languages:
  - `NSPhotoLibraryUsageDescription`: "To attach your CliQ transfer screenshot when you reserve a spot."
  - `NSCameraUsageDescription`: "To photograph your CliQ transfer receipt."

### 23.4 Monitoring

Sentry for crashes and unhandled promise rejections. Supabase logs for RPC failures. No analytics SDK, no tracking, no advertising identifiers.

---

## 24. QUESTIONS STILL OUTSTANDING FOR THE CLIENT

Nothing here blocks the build. Every one has a working default. Send them as a short WhatsApp message rather than convening another meeting.

1. **Does the player see what he owes?** Currently no, coach-only. One line to change. (A4)
2. ~~**The CliQ alias or number** to display in the payment sheet.~~ Answered: the alias is
   `prof2023`, and the account it resolves to is held by `MOHAMMAD YOUSEF A. ABUDABBOUR`. Both
   are hardcoded in `src/lib/config.ts` the way D71's WhatsApp number is — a public value the
   app cannot work without, so a build missing the variable must still show the right alias
   rather than none — with `EXPO_PUBLIC_CLIQ_ALIAS` and `EXPO_PUBLIC_CLIQ_ACCOUNT_NAME` able to
   change either without a new binary. 14.8's alias card gained one line the spec did not ask
   for: the account holder's name under the alias. The account is a personal one, so the name a
   player's bank shows him after typing the alias is not the academy's, and a name he cannot
   place at the moment of transfer stops the payment. Shown in the app first, it confirms
   instead.
3. **Google Maps links** for both venues, for the session detail screen.
4. **Vector logo files**, SVG or high resolution PNG, for the app icon and splash screen. The Instagram screenshot is enough to build with but not to ship.
5. **Who are the admins and assistant coaches**, by name and email, so their accounts can be seeded with the right roles.
6. **Which tier is the default** for a new player who has never been rated? Currently unrated, shown with a dashed badge, treated as B by the engine.
7. **Does a seventh rotation happen often** on extended sessions, or is six the norm? Currently six, with a manual add.
8. ~~**Where should the password reset link land?**~~ Answered, phase 10. A
   hosted page, not a deep link: `docs/reset-password/` in this repository, meant for GitHub
   Pages, reads the recovery token from the URL and calls Supabase's `auth/v1/user` endpoint
   directly to set the new password — no native deep-link handler, no new in-app screen, and
   it doubles as 23.3's privacy policy host (`docs/privacy-policy/`), which needed a URL for
   the identical reason. A custom-scheme deep link was the other option, but it depends on
   individual mail clients honouring `pob://` from inside their in-app browsers, which is
   unreliable without also standing up universal links — itself a hosted `.well-known` file,
   i.e. the same hosting requirement by a longer road. `src/features/auth/api.ts` passes
   `EXPO_PUBLIC_PASSWORD_RESET_URL` as `redirectTo` once it is set; see OPEN-ITEMS.md for what
   is still a manual step (enabling Pages, filling `docs/reset-password/config.js`).

---

## APPENDIX A, ERROR CODE REFERENCE

Every server error code, its cause, and the string key the client shows.

| Code | Raised by | Player message key |
|---|---|---|
| `session_not_found` | booking, cancel | `error.sessionNotFound` |
| `session_not_open` | booking | `error.sessionCancelled` |
| `outside_booking_window` | booking | `error.tooFarAhead` |
| `booking_window_closed` | booking | `error.bookingClosed` |
| `email_not_confirmed` | booking | `error.confirmEmailFirst` |
| `account_deleted` | booking, auth | `error.accountDeleted` |
| `already_booked` | booking, waitlist join | `error.alreadyBooked` |
| `session_full` | booking | `error.sessionFull` |
| `no_credits_available` | booking | `error.noCredits` |
| `not_your_booking` | cancel | `error.generic` |
| `already_cancelled` | cancel | `error.alreadyCancelled` |
| `cancellation_window_closed` | cancel | `error.cancellationWindowClosed` |
| `session_locked` | any staff mutation | `admin.error.sessionLocked` |
| `capacity_below_bookings` | session edit | `admin.error.capacityBelowBookings` |
| `not_authorized_to_change_privileged_fields` | profile update | `error.generic` |
| `only_coach_can_create_coach` | role change | `admin.error.coachOnly` |
| `subscription_expired` | extend | `admin.error.subscriptionExpired` |
| `cliq_requires_proof` | booking, review | `error.generic` |
| `proof_path_mismatch` | CliQ booking | `error.generic` |
| `proof_required` | CliQ booking | `error.uploadFailed` |
| `booking_not_found` | review | `error.sessionNotFound` |
| `invalid_amount` | `record_payment` | `admin.error.invalidAmount` |
| `credit_change_not_supported` | `record_payment` | `admin.error.creditChangeNotSupported` |
| `session_not_in_review` | confirm | `admin.error.sessionNotInReview` |
| `session_not_confirmed` | reopen | `admin.error.sessionNotConfirmed` |
| `player_not_found` | grant | `error.generic` |
| `package_not_found` | grant | `error.generic` |
| `invalid_visit_count` | grant | `admin.error.invalidVisitCount` |
| `invalid_expiry` | grant, extend | `admin.error.invalidExpiry` |
| `subscription_not_found` | extend, adjust | `error.generic` |
| `subscription_voided` | adjust | `admin.error.subscriptionExpired` |
| `note_required` | adjust | `validation.noteRequired` |
| `insufficient_credits` | adjust | `admin.error.insufficientCredits` |
| `court_locked` | `swap_lineup_players` | `admin.board.error.courtLocked` |
| `court_not_full` | `lock_court` | `admin.board.error.courtNotFull` |
| `rotation_not_found` | swap, lock | `error.generic` |
| `assignment_not_found` | `swap_lineup_players` | `error.generic` |
| `invalid_lineup` | `save_lineup` | `error.generic` |
| `same_player` | swap, `set_pairing_rule` | `error.generic` |
| `invalid_announcement_body` | `publish_announcement` | `validation.announcementTooLong` |
| `invalid_language` | `publish_announcement` | `error.generic` |
| `announcement_not_found` | `delete_announcement` | `error.generic` |
| `invalid_push_token` | `register_device_token` | `error.generic` |
| `invalid_platform` | `register_device_token` | `error.generic` |
| `not_a_player_booking` | `admin_move_booking` | `admin.error.notAPlayerBooking` |
| `invalid_target_session` | `admin_move_booking` | `admin.error.invalidTargetSession` |

Both `admin_move_booking` rows came with 15.2's "Move to another session",
phase 10 — see OPEN-ITEMS.md for the three questions that RPC answers.

The eight before the court board rows were added with sections 15.9 and 15.10;
see A61. The six after them came with the court board; see A62. The last five
came with announcements and push; see A67. `not_authorized` covers the staff
gate on both announcement functions and is already listed above (A33).

## APPENDIX B, WHAT TO DO WHEN THIS DOCUMENT IS WRONG

It will be wrong somewhere. When you find a contradiction:

1. Prefer Section 3, the decisions register, over prose elsewhere
2. Prefer prose over the assumptions register
3. If two decisions genuinely conflict, implement neither, leave the feature unbuilt, and record the conflict at the end of this file under a heading `## CONFLICTS FOUND`
4. Never resolve a conflict by picking the one that is easier to build

---

*End of specification. Version 3.0, 20 August 2026.*


---

## CONFLICTS FOUND

Recorded per Appendix B by the phase 0 agent. Each entry states the
contradiction, what was built, and why. Every one is a one-sentence decision
for the client to overturn.

### C1, Arabic numerals in money and time

**The contradiction.** Section 5.3 gives `formatMoney` the example output
`"٦٫٠٠٠ د.أ"`, using Arabic-Indic digits and the Arabic decimal separator.
Section 16.1 states: "Numbers: Western Arabic numerals (0-9) in both
languages. Jordanians read them fine and it avoids mixed-numeral confusion in
times and money." Section 16.3's Arabic sample deck also uses Arabic-Indic
digits, for example `"الإلغاء قبل أقل من ٣ ساعات يتم عن طريق الكابتن."`

**What was built.** Section 16.1. Arabic money renders as `6.000 د.أ`, Arabic
times as `7:00 مساءً`, and every digit in `ar.json` is Western. A test in
`src/i18n/__tests__/keyParity.test.ts` fails the build if an Arabic-Indic digit
reappears in the Arabic deck.

**Why not Appendix B rule 3.** Rule 3 says to leave a genuinely conflicting
feature unbuilt. Doing so here would delete `money.ts`, `time.ts`, and the
Arabic string deck, which is most of phase 0 and the foundation of every phase
after it. The two sides are also not of equal standing: 16.1 is an explicit
stated rule whose rationale names money and times directly, while 5.3's and
16.3's are illustrative examples. Rule 4 was respected: Western digits are not
the easier option, they are the one the rule argues for.

**To overturn.** One sentence. The change is `CURRENCY_SUFFIX` plus a digit
mapping in `src/lib/money.ts` and `src/lib/time.ts`, the Arabic deck, and the
numerals test.

### C2, per-visit credit value rounds two ways

**The contradiction.** Section 6.2 declares
`per_visit_fils integer GENERATED ALWAYS AS (price_fils / visit_count) STORED`,
which is Postgres integer division and therefore truncates. For the 30-visit,
125 JD package that yields **4166**. Section 5.3 states the same figure is
**4167** "with banker's rounding at the point of report aggregation", and
section 11.1's table gives the per-visit rate as **4.167 JD**.

One fils per credit becomes 30 fils per subscription, and section 12.2 rule 1
requires credit revenue to be valued at the subscription's per-visit rate
exactly.

**What was built.** Resolved by the client before phase 1, in favour of 4167.
`packages.per_visit_fils` is
`GENERATED ALWAYS AS (round(price_fils::numeric / visit_count)::integer) STORED`
in `supabase/migrations/0006_packages_subscriptions_credits_balances.sql`. The
five seeded packages yield 5000, 4667, 4500, 4167 and 4000, matching section
11.1 exactly.

**One residue, harmless today.** Postgres `round(numeric)` is half away from
zero; section 5.3 says half to even, which is what `bankersRound` in
`src/lib/money.ts` does. The two disagree only on an exact .5, and none of the
five packages produces one: a package would need `price_fils * 2 / visit_count`
to land on an odd integer. If a package is ever added that does, the server and
the client will differ by one fils on that package's per-visit rate, and the
generated column should move to an immutable `bankers_round` function.

### C3, where EmptyState and ErrorState live

**The contradiction.** Section 2.2 places state components in
`src/components/states/`; section 17.3 lists `EmptyState` and `ErrorState`
among `components/primitives`.

**What was built.** Section 2.2 for the location, since the phase 0 brief says
"folder structure exactly per section 2.2", and section 17.3 for the names.
Both files are in `src/components/states/`. Recorded rather than left unbuilt
because it is a filing question, not a behavioural one.

### Observations, not conflicts

- **Booking window wording.** The `bookingWindowEnd` comment in section 5.1
  says "now + 5 days, end of that day". Section 5.2's worked example and the
  `create_booking` guard in section 8.2
  (`session_date > current_date + interval '4 days'`) both mean today + 4, that
  is 5 days inclusive of today. Built as today + 4; the comment is the loose
  one and both authoritative sources agree.
- **Section 5.2 weekday.** The worked example calls 20 August 2026 a Tuesday;
  it is a Thursday. The date arithmetic in the example is unaffected.
- **`pg_trgm` ordering.** Section 6.2 creates `idx_profiles_name_trgm` and then
  `CREATE EXTENSION IF NOT EXISTS pg_trgm` below it. The operator class has to
  exist before the index references it, so migration 0001 installs the
  extension (into the `extensions` schema, per Supabase convention) and 0002
  builds the index against `extensions.gin_trgm_ops`. A typo in the spec, not a
  decision.
- **The profile guard applies to the service role too.**
  `guard_profile_privileged_fields` gates on `is_staff()`, which reads
  `auth.uid()`. A service-role connection has no `auth.uid()`, so `is_staff()`
  is false and the service role cannot change a role, visibility, tier, or
  custom rate either. Built exactly as section 7.3 writes it. It does not
  obstruct anything specified: the phase 2 `delete-account` function anonymises
  names, email, phone, and `deleted_at`, none of which are guarded. Worth
  knowing before writing any future service-role job that touches those five
  columns.
- **TanStack passes context as a second argument.** `useMutation`'s
  `mutationFn` is called as `fn(variables, context)` in v5. Every mutation
  function in the app takes one argument and ignores the rest, but a test
  asserting with `toHaveBeenCalledWith` has to account for it.
- **`fireEvent` and `render` are both async in RNTL 14 on React 19.** An
  un-awaited `fireEvent` leaves work in flight that the next test's render
  collides with, and the failure looks like an empty tree rather than a race.
  The `screen` singleton is not populated at all; tests work from the object
  `render` resolves to.
- **`pg_cron` reads its schedules in the server's timezone**, which on Supabase
  is UTC. Every Amman time in 8.6 is written in migration 0019 as Amman minus
  three hours, with no DST arithmetic, because Jordan has had none since 2022.
  `cron.schedule` replaces a job of the same name, so re-running the migration
  on a `db reset` leaves no duplicates.
- **8.6 lists five jobs and phase 3 schedules two.** The 5 minute status
  advance and the nightly `generate_sessions(21)` are phase 3's. The 7 day lock
  and the payment proof purge are phase 5's and the subscription expiry is
  phase 6's, per section 20; scheduling them now would mean writing the
  machinery they act on now. Migration 0019 names all five and says which two
  it creates.
- **The audit trigger fires on every cost recomputation.** `trg_audit_session_instances`
  is an AFTER UPDATE trigger on the whole row, and `recompute_night_costs`
  updates every mutable session on a night. A nightly generation run therefore
  writes roughly one audit row per generated session plus one per recomputed
  sibling. At twelve sessions a week that is noise, not volume, but it is worth
  knowing before anyone reads `audit_log` expecting only human actions.
- **14.0 lists a `BookingConfirm` route; 14.8 says it is not a screen.** The
  navigation tree in 14.0 puts `BookingConfirm` in the schedule stack, and
  14.8's first line is "A bottom sheet, not a screen." Built as a sheet: it is
  the more specific statement, and a route cannot sit over the session summary
  the player is deciding from. `ScheduleStackParamList` says so where the route
  would have been.
- **The client is stricter than the server by one millisecond on the 3 hour
  boundary.** `isWithinCancellationWindow` in `src/lib/time.ts` is `now <
  cutoff`; `cancel_own_booking` refuses only when `now() > starts_at - interval
  '3 hours'`, so the instant itself is still acceptable to the server. For that
  one millisecond the button is hidden on a cancellation the server would have
  taken. Left as it is because it errs the safe way — the client never offers a
  button the server will refuse — and asserted in
  `src/features/bookings/__tests__/bookingState.test.ts` so it is recorded
  rather than rediscovered.
- **`fireEvent.press` finds a composite component's `onPress` prop.** React
  Native Testing Library walks up from the pressed element through composite
  elements as well as host ones, so pressing anything inside a component that
  *takes* an `onPress` prop calls that prop, whatever the component actually
  rendered. A row that guards its own handler internally therefore still looks
  pressable to a test. `PlayerRow` is given no `onPress` at all when it is
  disabled, which makes it inert in fact rather than only in appearance.
- **Storage forbids a SQL delete of an object.** `storage.protect_delete`
  raises on any DELETE against `storage.objects` that does not come through the
  Storage API, whatever role issues it, including the service role and a
  `SECURITY DEFINER` function owned by `postgres`. Anything in 8.6 that has to
  remove a file is an edge function, not a cron job. See A54.
- **A deferred constraint trigger cannot be satisfied across two PostgREST
  requests.** Each request commits on its own, so the check fires at the end of
  the first one. Two rows that have to exist together have to be written by one
  statement or one function — which is what makes A46's invariant real rather
  than advisory, and what `supabase/tests/helpers/bookingFixtures.ts` has to
  work around when it arranges a CliQ booking.
- **Resetting form state when a sheet opens is a lint error, not a pattern.**
  `react-hooks/set-state-in-effect` rejects `useEffect(() => setX(...))`. The
  sheets whose defaults depend on which row was tapped are mounted only while
  open and keyed by the booking, so a different row is a different component
  with its own `useState` initialiser. The phase 4 sheets, whose defaults are
  fixed, reset on close instead and are unaffected.
- **Seed files are pipelined, not executed statement by statement.** The
  Supabase CLI parses every statement in `seed.sql` before it executes any of
  them, so a helper function created in that file cannot be called from it.
  Anything needing run-time name resolution lives inside a `DO` block. Seeded
  `auth.users` rows also need `confirmation_token`, `recovery_token`,
  `email_change_token_new` and `email_change` set to empty strings rather than
  NULL, or GoTrue fails every sign-in with "Database error querying schema".


### C4, email confirmation cannot both gate booking and let him browse

**The contradiction.** D12 says two things: "Email confirmation is required
before a player can create a booking. He can log in and browse before
confirming." 14.3 repeats the second half ("The player can skip and browse"), as
does A10. Section 2.1 and section 8.2's `create_booking` guard
(`email_confirmed_at IS NOT NULL`) depend on the first.

Supabase Auth cannot do both. Its own documentation states the setting
"configure[s] whether users need to verify their email **to sign in**", and the
behaviour was confirmed against the local stack before anything was built: with
confirmations on, `signUp` returns a user and no session, and
`POST /token?grant_type=password` answers `email_not_confirmed`. With
confirmations off, no confirmation email is ever sent and `email_confirmed_at`
is set at once, so section 8.2's guard would pass for everybody and the verify
screen would have nothing to verify.

**What was built.** Confirmations on, in `supabase/config.toml`. Sign up leads
to VerifyEmail, which polls by attempting the sign-in the player will make
anyway; it fails with `email_not_confirmed` until he taps the link and succeeds
the moment he has, which is what 14.3's "advances automatically" describes.
Browsing before confirming is therefore not reachable. Section 9.1 rule 5,
`error.confirmEmailFirst` and the `create_booking` guard are all kept exactly as
specified: they are dormant rather than dead, and become live the day the
setting changes.

**Why not Appendix B rule 3.** Leaving the feature unbuilt would mean no auth at
all, which is the whole of phase 2. The two halves are also not of equal
standing: "confirmation is required before a player can create a booking" is
restated in 9.1, 14.3, A10, Appendix A and the phase 1 `create_booking`
function, and the phase brief's own definition of done says a new user must
"register, confirm by email, sign in". The browse-before-confirm half appears
twice and gates nothing.

**To overturn.** One sentence, and roughly one line:
`enable_confirmations = false` in `supabase/config.toml`. Note what it costs —
no confirmation email is sent at all, so the booking guard stops meaning
anything. If the client wants both, it needs a confirmation mechanism outside
GoTrue, which is a much larger change than a phase 2 decision should make.
`supabase/tests/authTrigger.test.ts` asserts where the boundary currently sits.

### C5, the player cannot see the screenshot he uploaded

**The contradiction.** 14.10 says the booking detail screen shows "the session
summary, payment method, and for CliQ, the uploaded screenshot thumbnail".
Section 7.3's closing paragraph says of the `payment-proofs` bucket: "a player
may `INSERT` an object whose path starts with his own user id. Only staff may
`SELECT`." A player therefore cannot read back the file he just uploaded, and
the thumbnail 14.10 asks for cannot be fetched.

The `payment_proofs` *table* does grant him SELECT on his own booking's row
(7.3's policy table), which is why the two halves look compatible until you try
to render the image: he can see that a proof exists and not what it is.

**What was built.** Section 7.3. The bucket policy is unchanged from phase 1 —
insert under his own user id, staff-only read — and 14.10's CliQ card says the
screenshot was sent to the coach rather than showing it. He has the image in
his own gallery; the copy in storage exists for the coach's review screen
(10.2).

**Why not Appendix B rule 3.** Leaving it unbuilt would mean no CliQ flow,
which is most of phase 5. The two sides are also not of equal standing: 7.3 is
a security boundary stated as a rule, in the section whose opening line is
"Visibility levels are a security boundary, not a UI preference"; 14.10's
thumbnail is one clause in a screen description. Rule 4 was respected — the
staff-only bucket is not the easier option, it is the one the security section
argues for.

**To overturn.** One sentence, and one policy: a `payment_proofs_select_own`
policy on `storage.objects` matching `(storage.foldername(name))[1] =
auth.uid()::text`, plus a signed URL on the booking detail screen. Note what it
costs: a player would then be able to enumerate and read every object under his
own prefix, which is currently a folder nothing can read.

### C6, sit-out selection sorts the wrong way

**The contradiction.** 13.6's `selectPlayers` reads: "If attendees ≤ court
capacity, everybody plays. Otherwise sort by sit-out count ascending, take the
top N, and break ties with the seeded RNG so it is not always the same people."
N is `courtCount * 4`, the playing set. Taking the players with the *fewest*
sit-outs means the players with the most sit-outs are the ones left over, so the
same people rest every rotation and nobody else ever does.

13.4's hard constraint 6 says the opposite and says it is inviolable: "Sit-out
counts are as even as possible: no player sits out twice before every other
player has sat out once." 19.2's *Ragged bands* fixture asserts exactly that
over thirteen players and four rotations, and 13.6's own tie-break clause
("so it is not always the same people") argues against its own sort direction.

The same sentence's first half is wrong twice over: with thirteen attendees on
four courts, "attendees ≤ court capacity" is true, so everybody plays — on
three full courts and a court of one. *Ragged bands* asserts one sit-out per
rotation.

**What was built.** The hard constraint. `selectPlayers` in
`src/features/matchmaking/engine.ts` sorts descending, so whoever has rested
most goes on first, and ties are broken with the seeded RNG as 13.6 asks. How
many play at all comes from `planCapacity`, which follows 13.7's table rather
than raw capacity: a remainder of one or three players rests one of them
instead of seating a court nobody can play on.

**Why not Appendix B rule 3.** Leaving it unbuilt would mean no sit-out
selection, and therefore no engine, which is the whole of phase 7. The two
sides are not of equal standing either: rule 1 of Appendix B prefers the
decisions register and 13.4 is the section that declares its constraints never
violated, against one clause of pseudocode prose that contradicts its own
following sentence. Rule 4 was respected — descending is not the easier
direction, it is the one the constraint and the fixture both require.

**To overturn.** One sentence. The change is the comparator in
`selectPlayers`, and *Ragged bands* and the sit-out fairness test in
`engine.test.ts` would both have to be deleted with it.

### Observations from phase 7, not conflicts

- **`Court.team1` cannot be a pair.** 13.2 types the two teams as
  `[string, string]`. 13.7 requires a two-player singles court and, on exactly
  three attendees, a court of three. A fixed pair cannot express either, so
  both teams are `readonly string[]` holding one or two booking ids.
- **Rule 2's seed is dealt twice and the better deal kept.** 13.6 pairs "the
  strongest of the top half with the weakest of the bottom half", which
  equalises the pair sums and, on a roster arriving in clean tier bands, hands
  every pair the wrong intra-team gap: on 19.2's *Even bands* fixture it
  produces four teams at a gap of six and four at a gap of one, which 13.5
  scores at 64 against an available zero. No single swap from 13.6's move set
  reaches the zero — it takes two at once — so the hill climber cannot leave
  the local optimum and the fixture's "every team spanning at least 2 tier
  points" fails. `seedRule2` therefore deals both pairings of the two halves,
  scores each with 13.5, and hill climbs the better one. 13.6's snake remains
  one of the two candidates; 13.5 is left as the authority on which is good,
  which is what it says it is.

### Observations from phase 10, not conflicts

- **i18next falls back through the plural forms, so a missing one is silent.**
  Its candidate list for a counted key ends with `key_other` and then the bare
  `key`, which means an Arabic deck carrying only `_one` and `_other` renders
  something for every count rather than failing. It renders the wrong Arabic:
  `_other` grammar for a dual, for the 3–10 band, and for 11–99. Five families
  had shipped that way — `admin.cancel.bookingsLine`,
  `admin.cancel.creditsLine`, `payment.creditSub`, `schedule.sessionsThatDay`
  and `session.courtsValue` — because the parity suite named
  `schedule.spotsLeft` alone. It now discovers every base key carrying any
  plural suffix and requires all six in both decks, so a new counted string is
  under the rule the moment it is added.

  The house style the existing families had already set is kept: English
  carries all six for parity but names the number in `_two` ("2 spots left"),
  which is also what the interpolation check requires, since the Arabic dual is
  a word rather than a digit.

- **The matchmaking performance fixture measures wall clock inside a Jest
  worker.** 19.2's last row asserts 20 players over 6 rotations in under 300ms
  "on a mid-range device". Run alone it takes about a fifth of that; run as one
  of sixty-nine suites on a loaded machine it has been seen at 338ms. The
  budget is an acceptance criterion and was left alone rather than widened —
  the engine's own limit is 150ms per rotation and is what actually bounds it —
  but a single failure of that test in a parallel run is contention, not a
  regression. Recorded in OPEN-ITEMS.md.

- **`expo-image-picker` asks for the microphone.** Its config plugin adds
  `android.permission.RECORD_AUDIO` unless told otherwise, because a picker can
  pick video. Nothing in the app or the specification wants it, and a Play data
  safety form has to account for every permission in the manifest. See A80.

- **A `jest.mock` factory cannot close over a name that does not begin with
  `mock`.** Babel hoists `jest.mock` above every other statement in the file,
  and the plugin enforces the prefix rather than letting a test fail at run time
  with a reference error. It reports it as a syntax error pointing at the
  identifier, which reads like a parser bug and is not one.

- **`jest.resetModules()` gives the module under test a different mock object
  from the one the test file imported.** A suite that reloads a module to reset
  its state has to re-require its mocked dependencies from inside the same reset
  registry, or it asserts on a mock nothing called. This is why
  `monitoring.test.ts` hands back the Sentry functions alongside the module
  rather than importing them at the top.

- **`exactOptionalPropertyTypes` forbids clearing a key by assigning
  `undefined`.** Removing it from the object is the only way, which is what
  `beforeBreadcrumb` does to strip a navigation breadcrumb's data.

- **A `Text` variant composes its style into an array.** A test asserting on a
  style a caller passed has to use `arrayContaining` rather than
  `objectContaining`, or flatten first. The failure prints the whole array and
  reads like a mismatch of values rather than of shape.
