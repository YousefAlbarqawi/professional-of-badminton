# Store submission

Everything BUILD-SPEC section 23 asks for that is a document rather than code.
Section 23.2's checklist is at the bottom; work down it.

| File                   | What it is                                                           |
| ---------------------- | -------------------------------------------------------------------- |
| `privacy-policy.en.md` | 23.3's privacy policy, English. Also lives at `docs/privacy-policy/` |
| `privacy-policy.ar.md` | The same, Arabic                                                     |
| `play-data-safety.md`  | 23.3's Play data safety answers, ready to copy into the console      |
| `listing.en.md`        | App Store and Play listing copy, English                             |
| `listing.ar.md`        | The same, Arabic                                                     |
| `screenshots.md`       | 23.3's screenshot plan: which screens, which sizes, both languages   |

---

## The hosted pages

23.3's privacy policy URL and section 24 question 8's password reset landing
both needed a host. Decided in phase 10, recorded in full in `OPEN-ITEMS.md`:
`docs/` off this repository, deployed by Vercel, and — since the domain was
bought — served on `professionalofbadminton.com` rather than on the generated
`.vercel.app` name.

| Page           | URL                                                   |
| -------------- | ----------------------------------------------------- |
| Privacy policy | `https://professionalofbadminton.com/privacy-policy/` |
| Password reset | `https://professionalofbadminton.com/reset-password/` |
| Delete account | `https://professionalofbadminton.com/delete-account/` |

The third page was added during the Play submission itself. Play's Data safety
form makes **Delete account URL** a required field for any app that lets users
create an account, and refuses to advance past step 2 without it — so the
in-app-only deletion this repository had documented was not enough. See
`play-data-safety.md`.

The apex is canonical and `www` redirects to it, which is the reverse of
Vercel's own default. The apex is what goes into App Store Connect, Play
Console and Supabase's redirect allow-list, and it is the same domain the mail
already sends from — one name for the product rather than two.

### Wiring the domain

DNS is at Namecheap, on **BasicDNS**, under Advanced DNS. Both records are
added and live:

| Type    | Host  | Value                                  |
| ------- | ----- | -------------------------------------- |
| `A`     | `@`   | `216.198.79.1`                         |
| `CNAME` | `www` | `d1ff9858ea0847b1.vercel-dns-017.com.` |

The `A` value is Vercel's current apex IP, not the legacy `76.76.21.21` — that
one still resolves but the dashboard recommends this one. The `CNAME` target is
issued per project and is not guessable; it came from Vercel's Domains page.

**Do not switch the nameservers to Vercel.** Namecheap's zone already carries
everything the mail depends on — the Resend DKIM key, the `send` and `rsend`
return-path records, the `p=none` DMARC record and the `eforward*` MX records
for forwarding. Vercel's nameservers would serve an empty zone, and mail to and
from `professionalofbadminton.com` would stop. Adding an `A` on `@` alongside
the existing `MX` is fine: they are different record types and do not collide.

Done, in this order:

1. ~~Vercel → the project → Settings → Domains → add
   `professionalofbadminton.com` (Production) and
   `www.professionalofbadminton.com` (308 redirect to the apex)~~ — done.
   Vercel pre-checks **"Redirect apex domains to www"** in that dialog; it has
   to be unchecked, or it inverts the choice above and makes `www` canonical.
2. ~~Add the two DNS records above at Namecheap~~ — done, and both resolve at
   `dns1.registrar-servers.com`. Vercel issued the apex certificate on its own.

Still open:

3. ~~Set `EXPO_PUBLIC_PASSWORD_RESET_URL` on the EAS `production` environment
   to the new `/reset-password/` URL~~ — done. It is inlined at build time, so
   it reaches players only in the next production build; the old URL still
   resolves until then.
4. ~~Add that same URL to `pob-prod`'s Authentication → URL Configuration →
   Redirect URLs in the Supabase dashboard~~ — done. The old Vercel and GitHub
   Pages URLs stay on the allow-list alongside it: a reset link already sitting
   in somebody's inbox still points at the old host, and Supabase matches
   `redirectTo` exactly, so removing them would break links already sent.

**The vector logo** (section 24 question 4) is no longer on this list — the
client's files are in and `assets/icon.png`, `assets/splash-icon.png` and the
Android adaptive layers are regenerated from them. What `screenshots.md` is
still waiting on is a dev build carrying the new icon, not the logo itself.

---

## Before any production build: the Node version

`package-lock.json` must be generated with **Node 22.23.1 / npm 10.9.8** — the
versions EAS's build image runs. `.nvmrc` pins it; run `nvm use` before any
`npm install` that touches the lockfile.

A lockfile generated by a newer npm (11.x resolves `@unrs/resolver-binding-wasm32-wasi`'s
`@emnapi/*` dependencies differently) installs fine locally and fails `npm ci`
on EAS, taking the build down in the Install dependencies phase within seconds.
This has now bitten twice — once during the first Android build, and again
before the first submission. To verify a lockfile before spending a build:

```
nvm use                        # 22.23.1, from .nvmrc
rm -rf /tmp/ci-check && mkdir -p /tmp/ci-check
cp package.json package-lock.json /tmp/ci-check/
cd /tmp/ci-check && npm ci
```

Exit 0 there means EAS's install phase will pass.

## 23.2, the release checklist

Both stores were submitted on 2026-09-01 and both are now waiting on a
reviewer. "Where each store stands" at the end of this section says what each
is actually blocked on, which is not the same as what is unchecked here.

- [x] The hosted pages deployed — Vercel serving `docs/`, with
      `docs/reset-password/config.js` filled with `pob-prod`'s URL and anon key
- [x] `professionalofbadminton.com` added to the Vercel project and its two DNS
      records added at Namecheap, per "Wiring the domain" above — nameservers
      and all four mail records left untouched
- [x] `https://professionalofbadminton.com/reset-password/` added to
      `pob-prod`'s Authentication → URL Configuration → Redirect URLs, with the
      older Vercel and GitHub Pages URLs left on the list
- [x] `docs/delete-account/` written and deployed. Play makes a **Delete
      account URL** a required field for any app that lets users create an
      account and will not advance past the Data safety form without one; see
      `play-data-safety.md`, which used to claim this was not applicable
- [x] `pob-prod`'s Authentication → SMTP Settings pointed at Resend (see
      "The production sender" below). Done 2026-09-02: custom SMTP on,
      `smtp.resend.com:465`, user `resend`, sending as
      `noreply@professionalofbadminton.com` under the name "Professional of
      Badminton". Verified end to end rather than by the form going green — a
      real `/auth/v1/recover` call answered 200 and the message appears in
      Resend's log with that From address, so GoTrue is genuinely reaching
      Resend and not failing silently
- [x] The **Confirm sign up** template pasted into the dashboard, byte for byte
      from `supabase/templates/confirm.html`, so the two can be diffed. This
      matters more than the sender did. Supabase locks template editing behind
      custom SMTP, so until it was configured prod was serving GoTrue's default
      body — `{{ .ConfirmationURL }}` and nothing else. The app's
      `VerifyEmailScreen` asks for a six digit code, and **no code was being
      sent at all**: every player would have found the code field useless and
      had to fall back to the link and the poll. One fix closed both, because
      the SMTP switch is what unlocks the template
- [x] Auth email rate limit. Supabase raised it from **2 per hour** to 30 by
      itself the moment custom SMTP was enabled. Two an hour would not have
      onboarded twelve closed testers in an evening
- [x] Version bumped in `app.config.ts`, build number incremented — 1.0.0 for
      the first release. `appVersionSource: "remote"` with `autoIncrement`
      carries both counters on EAS: Android version code 7, iOS build number 4
- [x] `ITSAppUsesNonExemptEncryption: false` declared in `app.config.ts`'s
      `infoPlist`, committed **before** the first iOS build. App Store Connect
      asks the export-compliance question on every build and the answer never
      changes; adding the key afterwards would have meant discarding a finished
      build to carry a value that was known all along
- [x] Migrations applied to `pob-prod` — **before** the build is submitted,
      never after. All 44 are applied; `supabase migration list --linked`
      shows local and remote agreeing on every one, including 0042, 0043 and
      the version-alignment migration. The venue, cost, package and template
      portions of `seed.sql` are in (2 venues, 12 templates, 5 packages,
      counted against prod). The dev-only portion never went near prod
- [x] Exactly one account exists in prod, and it is not a player.
      `googleplay.review@professionalofbadminton.com` was created for the two
      review teams, auto-confirmed so the unconfigured SMTP could not block it.
      Both stores hold the same credentials. It is an ordinary `player` at
      `level_0` with `preferred_locale` `en`, so a reviewer sees what a new
      player sees, in a language they read.
      **The dashboard's "Add user" form sets no user metadata**, and
      `handle_new_user` returns early when the phone is empty (migration 0014),
      so the trigger created no profile — the `profiles` row was inserted by
      hand. Anyone repeating this must do the same or the account signs in to a
      broken app. Prod still holds zero bookings, subscriptions, payments and
      announcements.
      **That address has no mailbox.** It is on the verified domain, so mail
      sent to it leaves Resend and then bounces — one such bounce is already in
      the log, from the message used to prove SMTP works. It costs nothing
      today, because the account was created auto-confirmed and a reviewer only
      signs in. It would cost something if a reviewer ever used "forgot
      password", and bounces are the thing that erodes a sending domain's
      reputation, so add a forwarding rule at Namecheap or stop mailing it
- [x] `pob-prod` cron jobs scheduled: all seven are active — `generate-sessions`
      (03:00 Amman), `lock-expired-sessions` (03:10), `void-expired-subscriptions`
      (03:20), `purge-payment-proofs` (04:00), `advance-session-states` and
      `close-started-waitlists` (every 5 min) and `drain-push-outbox` (every 15).
      Confirmed firing, not merely registered: prod's `audit_log` carries 100
      `session_instances` rows written by the generate and advance jobs
- [x] EAS environment variables set for the `production` environment (see
      below). Eleven are set: the two Supabase values, the EAS project id, the
      WhatsApp number, the password reset URL, the CliQ alias and account name,
      the Sentry DSN, `SENTRY_ORG`, `SENTRY_PROJECT` and — still, deliberately —
      `SENTRY_DISABLE_AUTO_UPLOAD`. The CliQ pair are hardcoded fallbacks in
      `src/lib/config.ts` as well, so they are set only to allow changing the
      alias without a new build
- [x] `SENTRY_AUTH_TOKEN` set as a **secret**, then
      `SENTRY_DISABLE_AUTO_UPLOAD` deleted from the production environment — in
      that order. See "Sentry source maps" below for why the reverse fails the
      build. Done: the token is stored secret-visibility (readable only by the
      EAS builder, not by any UI) and the flag is gone, so the next production
      build uploads source maps
- [x] `eas build --profile production --platform android` — done, 2026-08-30.
      Version 1.0.0, version code 7, from commit `dcb3203`. Signed `.aab` at
      the EAS build page (build `6bc6b189-60cc-4f46-80ee-6d6eadc29a4a`)
- [x] iOS signing credentials created — see "iOS signing" below. This was not
      one command: EAS will not mint an Apple distribution certificate in a
      non-interactive build and `eas credentials` has no non-interactive mode
- [x] `eas build --profile production --platform ios` — done, 2026-09-01.
      Version 1.0.0, build number 4, from commit `a942c0e` (build
      `315657f2-d310-468e-9f7d-40dc1f2bd458`)
- [x] Smoke test on a physical iOS device and a physical Android device,
      against prod — done, confirmed by the client
- [x] Privacy policy URL (`https://professionalofbadminton.com/privacy-policy/`)
      entered in App Store Connect and in Play Console
- [x] Play data safety form completed from `play-data-safety.md` — seven data
      types, nothing shared, encrypted in transit, deletion URL supplied
- [x] Apple's App Privacy questionnaire completed and **published** — the same
      seven types in Apple's taxonomy. Crash Data is the one declared _not_
      linked to identity, which is accurate: `src/lib/monitoring.ts` sets
      `sendDefaultPii: false` and never sets a user on the Sentry scope.
      Publishing is a separate step from filling it in, and App Review will not
      accept the version until it is published
- [x] Screenshots uploaded per `screenshots.md` — all four sets, both stores,
      both languages. On the App Store they go in the **6.9"** slot, which
      lives in Media Manager rather than on the version page; the 6.5" slot
      then reports "Using 6.9" Display" and needs nothing. The version page
      offers only 6.5", whose dimensions our 1320 × 2868 files fail
- [x] Age rating 4+, category Sports — on Play the IARC questionnaire returns
      ESRB Everyone / PEGI 3 / ClassInd All ages; on the App Store the
      calculated rating is 4+ across 172 countries, with the age category set
      to **Not Applicable** rather than any override
- [x] **First release: upload the `.aab` by hand.** `eas submit` cannot do it.
      The Google Play Developer API refuses to publish to a package that has
      never had a release, so the very first bundle went through the Play
      Console UI. It went to **Closed testing**, not Internal, for the reason
      under "Where each store stands"
- [x] `eas submit --platform ios` — the binary is on App Store Connect. This
      needs `ascAppId`, `appleTeamId` and the three `ascApiKey*` fields in
      `eas.json`; the `EXPO_ASC_*` environment variables cover builds but not
      submissions
- [ ] Google Play service account created and its JSON key wired into
      `eas.json`'s `submit.production.android.serviceAccountKeyPath` — needed
      for every release _after_ the first, not for the first
- [ ] `eas submit --platform android` for subsequent releases

## Where each store stands

|           | Google Play            | App Store                       |
| --------- | ---------------------- | ------------------------------- |
| App id    | `4976185065492171480`  | `6807263224`                    |
| Submitted | 15 changes, in review  | version 1.0, waiting for review |
| Track     | Closed testing — Alpha | production, manual release      |
| Countries | Jordan                 | Jordan                          |
| Release   | as soon as approved    | held until you release it       |

**Play is not blocked on Google, it is blocked on testers.** This is a Personal
developer account, and Google requires twelve testers opted in to a _closed_
test for fourteen continuous days before it will grant production access.
Internal testing does not count toward that clock, which is why the first
release went to Closed testing instead — the checklist above originally said
Internal. One tester is on the list (`yo.khatib@gmail.com`); eleven more are
needed, and the fourteen days start when they opt in, not when the track was
created.

**The App Store release is deliberately manual.** Apple approving the version
will not put it on sale; the release has to be triggered by hand, so approval
and launch are two separate decisions rather than one.

Both stores are restricted to Jordan. On the App Store that is not only a match
for the academy: distributing in the EU requires a Digital Services Act trader
status that this account has not provided, and Apple removes apps that lack it.
Expanding beyond Jordan means providing it first.

## iOS signing

EAS could not create the signing identity. `eas build --non-interactive` stops
at "Distribution Certificate is not validated for non-interactive builds", and
`eas credentials` offers no non-interactive mode to do it beforehand. The
identity was therefore created directly against the App Store Connect API with
an Admin key, and `production.ios.credentialsSource` is set to `local`.

| Thing                    | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| Apple team               | `LBSMYS2R74`                                                |
| Distribution certificate | `U23SVFH3BF`, expires 2027-09-01                            |
| API key                  | `HFDB23UW4R`, issuer `01e40122-f36a-4e0e-9919-9ef91fce3314` |
| Key file                 | `~/.appstoreconnect/AuthKey_HFDB23UW4R.p8`                  |
| Signing files            | `~/.appstoreconnect/pob/`                                   |

Everything secret lives outside the repository. `credentials.json` names those
files and carries the `.p12` password, so it is gitignored alongside the
existing `*.p12` and `*.mobileprovision` rules. `eas.json`'s `ascApiKeyPath` is
an absolute path, which makes that one line machine-specific: another machine
needs its own copy of the key, because Apple lets a key be downloaded once.

`credentialsSource` is set under `production.ios` rather than on the profile
itself, and the nesting matters. One level higher it would apply to Android
too, and the next Android build would look for a local keystore instead of the
EAS-managed one that signed version code 7.

**Export the `.p12` with `-legacy`.** OpenSSL 3 defaults to PBES2 / PBKDF2 /
AES-256-CBC, which macOS's keychain cannot import; the build dies 42 seconds in
at "Prepare credentials" having reported the correct fingerprint and common
name moments earlier, which makes it look like anything but an encoding
problem. `openssl pkcs12 -export -legacy` writes the RC2-40 and 3DES form the
keychain expects.

## Play listing assets

`store/play-assets/` holds the two things Play Console asks for that are not
screenshots:

| File                     | Size       | Where it goes               |
| ------------------------ | ---------- | --------------------------- |
| `feature-graphic.en.png` | 1024 × 500 | Main store listing, English |
| `feature-graphic.ar.png` | 1024 × 500 | Main store listing, Arabic  |
| `listing-icon-512.png`   | 512 × 512  | App icon on the listing     |

Both feature graphics are flat PNG with no alpha, which is what Play requires.
They are the app's own palette — `#111111` ground, `#A8D5BA` accent — with the
brand mark from `assets/brand/pob-mark-transparent.svg` and the tagline from
`listing.en.md` / `listing.ar.md`. The Arabic one mirrors the layout and not the
mark: a logo does not flip.

Play localises the feature graphic per listing language, so upload each under
its own locale rather than picking one.

The source HTML is not kept — these are rendered artefacts. To change them,
rebuild from the same palette and re-export at exactly 1024 × 500.

## EAS environment variables

The `production` build profile reads its values from the EAS environment named
`production` rather than from a committed `.env`, so a prod URL and key are
never in the repository.

`eas-cli` is not a dependency of this project and is not installed globally —
run it as `npx eas-cli@latest ...`. (`npx eas` fails: the package is `eas-cli`,
the binary is `eas`.) Authentication is the `~/.expo/state.json` session from
`eas login`.

Set each once:

```
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value https://<prod-ref>.supabase.co
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <prod anon key>
eas env:create --environment production --name EXPO_PUBLIC_WHATSAPP_NUMBER   --value 962792841696
eas env:create --environment production --name EXPO_PUBLIC_CLIQ_ALIAS        --value prof2023
eas env:create --environment production --name EXPO_PUBLIC_CLIQ_ACCOUNT_NAME --value "MOHAMMAD YOUSEF A. ABUDABBOUR"
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN        --value https://c7a505e6cebe3ad2eb884d328d7a5bb2@o4511987203112960.ingest.de.sentry.io/4511987208749136
eas env:create --environment production --name EXPO_PUBLIC_EAS_PROJECT_ID    --value <the EAS project id>
eas env:create --environment production --name EXPO_PUBLIC_PASSWORD_RESET_URL --value https://professionalofbadminton.com/reset-password/
```

To **change** one that already exists, `env:create` is the wrong verb and
`env:update` is deprecated — use `env:set`, which creates or updates:

```
npx eas-cli@latest env:set --environment production \
  --name EXPO_PUBLIC_PASSWORD_RESET_URL \
  --value https://professionalofbadminton.com/reset-password/ \
  --type string --visibility plaintext --non-interactive
```

Without `--non-interactive` it prompts; note that `env:list` rejects that flag
even though `env:set` requires it.

`EXPO_PUBLIC_*` values are inlined into the JavaScript bundle and are readable
by anyone with the app, which is correct for all six: the anon key is public by
design and Row Level Security is the boundary (section 7). The service role key
is never among them — it exists only as an Edge Function secret (2.5).

## The production sender

`professionalofbadminton.com` is verified in Resend (region `eu-west-1`), so
confirmation and password reset mail can go out as
`noreply@professionalofbadminton.com` rather than from Resend's shared
`onboarding@resend.dev`, which only ever delivered to the Resend account's own
address. DKIM, the `rsend` and `send` return-path CNAMEs and a `p=none` DMARC
record all live in Namecheap's Advanced DNS for the domain.

Local Supabase reads that address from `.env`'s `SMTP_SENDER`, via
`[auth.email.smtp]` in `supabase/config.toml`. **A hosted project does not read
that file** — `pob-prod` had to be told the same thing by hand, in the Supabase
dashboard under Authentication → SMTP Settings. That is now done; the values
below are what it holds:

| Field       | Value                                 |
| ----------- | ------------------------------------- |
| Host        | `smtp.resend.com`                     |
| Port        | `465`                                 |
| Username    | `resend`                              |
| Password    | a Resend API key with Sending access  |
| Sender      | `noreply@professionalofbadminton.com` |
| Sender name | `Professional of Badminton`           |

Port 465 rather than 587 for the reason `supabase/config.toml` records: many
ISPs drop outbound 587, which surfaces as GoTrue hanging and answering
`/signup` with a 504 instead of refusing the connection.

Do **not** configure a tracking subdomain in Resend. It rewrites every link
through a redirector, and corporate mail scanners follow rewritten links
automatically — which would spend a one-time confirmation or reset token
before the player ever taps it.

## Sentry source maps

Three more variables, needed only so a crash report shows a line of TypeScript
rather than a line of minified bundle. `expo config` warns about the first two
until they exist; the warning is harmless and the build succeeds without them.

The Sentry organization and project both exist now, created during deployment:
org `professional-of-badminton`, project `professional-of-badminton`, platform
React Native, EU region — so the DSN is on `ingest.de.sentry.io`, which puts
crash data in the same jurisdiction as `pob-prod` in Frankfurt.

```
eas env:create --environment production --name SENTRY_ORG          --value professional-of-badminton
eas env:create --environment production --name SENTRY_PROJECT      --value professional-of-badminton
eas env:create --environment production --name SENTRY_AUTH_TOKEN   --value <token> --type secret --visibility secret
```

All three are set, and `SENTRY_DISABLE_AUTO_UPLOAD` has been deleted from the
production environment, so source map upload is live.

`SENTRY_AUTH_TOKEN` is the one that cannot be recovered later: Sentry shows an
organization token's value once, on the page that creates it, and never again.
If it ever needs replacing, create a new one at Settings > Organization Tokens
(the only scope on offer is `org:ci`, which is exactly source map upload and
release creation), copy the value at that moment, and revoke the old one.

**Order matters, and getting it wrong fails the build rather than degrading
it.** `SENTRY_DISABLE_AUTO_UPLOAD=true` must be present on the production
environment whenever `SENTRY_AUTH_TOKEN` is absent. Sentry's Gradle plugin does
not warn when `sentry-cli` has no organization to upload to — it exits non-zero
and takes `eas build` down with it, which is what OPEN-ITEMS.md records finding
the hard way. If the token is ever revoked without a replacement, put the flag
back before building.

`SENTRY_AUTH_TOKEN` is a build-time secret rather than a public variable: it can
upload artefacts to the Sentry project and must never be an `EXPO_PUBLIC_*`
value, because those are inlined into the bundle.

`EXPO_PUBLIC_SENTRY_DSN` is different and _is_ public — a DSN can only accept
events, and it has to be in the bundle for the app to send one.
