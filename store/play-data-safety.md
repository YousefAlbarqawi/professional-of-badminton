# Play Console — Data safety form

BUILD-SPEC 23.3: "Data safety form on Play: personal info collected, not shared
with third parties, deletable."

The answers below are what the app actually does, checked against the schema in
BUILD-SPEC section 6 and against `app.config.ts`. Copy them into the Play
Console form verbatim. If a future change makes one of them untrue, the change
is wrong or this file is out of date — say which.

---

## Data collection and security

| Question                                                              | Answer                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?   | **Yes**                                                               |
| Is all of the user data collected by your app encrypted in transit?   | **Yes** — every request is HTTPS to Supabase; push goes over APNs/FCM |
| Do you provide a way for users to request that their data be deleted? | **Yes** — in-app, Profile → Delete my account (BUILD-SPEC 14.14)      |
| Delete account URL                                                    | `https://professionalofbadminton.com/delete-account/`                 |

> The deletion URL was recorded here as "not applicable, deletion is in-app".
> That is no longer true and the Play Console proves it: because the app
> supports account creation, **Delete account URL is a required field** and the
> Data safety form's Next button stays disabled while it is empty. Google asks
> for a web page precisely for the player who has uninstalled the app or lost
> access to the account, which the in-app path cannot serve. `docs/delete-account/`
> is that page — bilingual, the same host as the privacy policy, listing the
> in-app steps, the WhatsApp fallback, and what is deleted against what is kept.

The partial-deletion question — "some or all of their data deleted **without**
requiring them to delete their account" — is answered **No**. It is optional,
and the app's only deletion path is deleting the whole account.

---

## Data types

For every row: **Collected = Yes. Shared = No.** Nothing is shared with a third
party for that party's own purposes, and nothing is sold. The processors listed
in the privacy policy hold data on the academy's behalf, which Play does not
count as sharing.

### Personal info

| Type                                                                          | Collected | Purpose                                                          | Optional? |
| ----------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------- | --------- |
| Name                                                                          | Yes       | App functionality — the coach's reservation list                 | Required  |
| Email address                                                                 | Yes       | App functionality; Account management — sign-in and confirmation | Required  |
| Phone number                                                                  | Yes       | App functionality — the coach contacts players about sessions    | Required  |
| User IDs                                                                      | Yes       | App functionality — the account identifier                       | Required  |
| Address, race, political or religious beliefs, sexual orientation, other info | **No**    |                                                                  |           |

### Financial info

| Type                               | Collected | Purpose                                                                                                | Optional? |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ | --------- |
| Purchase history                   | **No**    | Subscriptions are not bought in the app (D49, section 4 item 8), and there is no payment gateway (D35) |           |
| Payment info                       | **No**    | No card, no gateway, no merchant account (D35)                                                         |           |
| Credit score, other financial info | **No**    |                                                                                                        |           |

> The CliQ transfer screenshot is declared under **Photos**, not here. It is an
> image the player chooses to attach; the app performs no payment and reads
> nothing out of the image (D36, no OCR).

### Photos and videos

| Type   | Collected | Purpose                                                                                                 | Optional?                                        |
| ------ | --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Photos | Yes       | App functionality — one CliQ transfer screenshot per reservation, so the coach can confirm the transfer | **Optional** — only when the player chooses CliQ |
| Videos | **No**    |                                                                                                         |                                                  |

### App activity

| Type                                                                               | Collected | Purpose                                                | Optional? |
| ---------------------------------------------------------------------------------- | --------- | ------------------------------------------------------ | --------- |
| App interactions                                                                   | **No**    | There is no analytics SDK in the app (BUILD-SPEC 23.4) |           |
| In-app search history, installed apps, other user-generated content, other actions | **No**    |                                                        |           |

> Reservations, payments and credits are the academy's own records rather than
> behavioural data, and are covered by the rows above.

### App info and performance

| Type                       | Collected | Purpose                                                                                | Optional? |
| -------------------------- | --------- | -------------------------------------------------------------------------------------- | --------- |
| Crash logs                 | Yes       | Analytics — Sentry, for crashes and unhandled promise rejections                       | Required  |
| Diagnostics                | **No**    | Performance monitoring and session tracking are switched off (`src/lib/monitoring.ts`) |           |
| Other app performance data | **No**    |                                                                                        |           |

### Device or other IDs

| Type                | Collected | Purpose                                                                                               | Optional?                                                        |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Device or other IDs | Yes       | App functionality — an Expo push token, so a waiting-list spot or an announcement can reach the phone | **Optional** — only if the player grants notification permission |

> This is a push token, not an advertising identifier. The app requests no
> advertising ID, contains no advertising SDK, and declares no
> `AD_ID` permission.

### Everything else

**Not collected:** location (approximate or precise), contacts, calendar,
messages, health and fitness, files and documents, audio, web browsing history,
and advertising IDs.

---

## Advertising ID declaration

**Does your app use an advertising ID? No.**

`com.google.android.gms.permission.AD_ID` is not declared. There is no
advertising SDK, no attribution SDK and no analytics SDK in the dependency list
(`package.json`), which is the check to re-run if this answer is ever
questioned.

## Permissions declared on Android

| Permission                                    | Why                                                    |
| --------------------------------------------- | ------------------------------------------------------ |
| `INTERNET`                                    | The app is online only (D78)                           |
| `POST_NOTIFICATIONS`                          | Section 18's two notifications, requested contextually |
| Photo access (`READ_MEDIA_IMAGES` on API 33+) | Picking a CliQ screenshot, only in that flow           |
| `CAMERA`                                      | Photographing a CliQ receipt, only in that flow        |

`RECORD_AUDIO` is explicitly blocked in `app.config.ts`, even though
`expo-image-picker` adds it by default: this app picks one still image and
records nothing.

## Content rating and category

- **Age rating:** 4+ / Everyone (BUILD-SPEC 23.3)
- **Category:** Sports
