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

**Players tab.** The attendee list with tier badges and payment method chips. Header buttons: *Add player*, *Add guest*, *Add coach*. Swipe or long press a row for *Remove*, *Change tier*, *Move to another session*.

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
2. **The CliQ alias or number** to display in the payment sheet. Currently a placeholder.
3. **Google Maps links** for both venues, for the session detail screen.
4. **Vector logo files**, SVG or high resolution PNG, for the app icon and splash screen. The Instagram screenshot is enough to build with but not to ship.
5. **Who are the admins and assistant coaches**, by name and email, so their accounts can be seeded with the right roles.
6. **Which tier is the default** for a new player who has never been rated? Currently unrated, shown with a dashed badge, treated as B by the engine.
7. **Does a seventh rotation happen often** on extended sessions, or is six the norm? Currently six, with a manual add.

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

**What was built.** Nothing yet: this lands in phase 1's schema and phase 9's
reports. `bankersRound` exists in `src/lib/money.ts` and is tested against the
125000/30 case from section 5.3, returning 4167.

**Needs a decision before phase 1.** Either the generated column rounds instead
of truncating, or sections 5.3 and 11.1 are corrected to 4166. The phase 1
agent should not pick one silently.

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
