# Store submission

Everything BUILD-SPEC section 23 asks for that is a document rather than code.
Section 23.2's checklist is at the bottom; work down it.

| File                   | What it is                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| `privacy-policy.en.md` | 23.3's privacy policy, English. Also lives at `docs/privacy-policy/` |
| `privacy-policy.ar.md` | The same, Arabic                                                   |
| `play-data-safety.md`  | 23.3's Play data safety answers, ready to copy into the console    |
| `listing.en.md`        | App Store and Play listing copy, English                           |
| `listing.ar.md`        | The same, Arabic                                                   |
| `screenshots.md`       | 23.3's screenshot plan: which screens, which sizes, both languages |

---

## The hosted pages

23.3's privacy policy URL and section 24 question 8's password reset landing
both needed a host. Decided in phase 10, recorded in full in `OPEN-ITEMS.md`:
GitHub Pages, serving `docs/` off this repository. `docs/privacy-policy/` and
`docs/reset-password/` are both written; what remains is standing the site up,
which is a repository/dashboard action rather than code:

1. Push this repository to GitHub, then Settings → Pages → branch `main`,
   folder `/docs`.
2. Fill `docs/reset-password/config.js` with `pob-prod`'s URL and anon key.
3. Add `EXPO_PUBLIC_PASSWORD_RESET_URL` to the EAS environment commands below.
4. Add the resulting `.../reset-password/` URL to `pob-prod`'s Authentication
   → URL Configuration → Redirect URLs, in the Supabase dashboard.

**The vector logo** (section 24 question 4) is no longer on this list — the
client's files are in and `assets/icon.png`, `assets/splash-icon.png` and the
Android adaptive layers are regenerated from them. What `screenshots.md` is
still waiting on is a dev build carrying the new icon, not the logo itself.

---

## 23.2, the release checklist

- [ ] GitHub Pages enabled for this repository (`main`, `/docs`), and
      `docs/reset-password/config.js` filled with `pob-prod`'s URL and anon key
- [ ] The resulting `.../reset-password/` URL added to `pob-prod`'s
      Authentication → URL Configuration → Redirect URLs
- [ ] Version bumped in `app.config.ts`, build number incremented
- [ ] Migrations applied to `pob-prod` — **before** the build is submitted,
      never after. `supabase link --project-ref <prod>` then
      `supabase db push`, and run the venue, cost, package and template
      portions of `seed.sql` against prod (section 22). The dev-only portion
      never goes near prod.
- [ ] `pob-prod` cron jobs scheduled: all five of 8.6, plus the two deployment
      invocations OPEN-ITEMS.md records (the payment proof purge and the push
      outbox drain)
- [ ] EAS environment variables set for the `production` environment (see
      below), including a real `EXPO_PUBLIC_SENTRY_DSN`,
      `EXPO_PUBLIC_CLIQ_ALIAS` and `EXPO_PUBLIC_PASSWORD_RESET_URL`
- [ ] `eas build --profile production --platform all`
- [ ] Smoke test on a physical iOS device and a physical Android device,
      against prod
- [ ] Privacy policy URL entered in App Store Connect and in Play Console
- [ ] Play data safety form completed from `play-data-safety.md`
- [ ] Screenshots uploaded per `screenshots.md`
- [ ] Age rating 4+, category Sports
- [ ] `eas submit`

## EAS environment variables

The `production` build profile reads its values from the EAS environment named
`production` rather than from a committed `.env`, so a prod URL and key are
never in the repository. Set each once:

```
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value https://<prod-ref>.supabase.co
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <prod anon key>
eas env:create --environment production --name EXPO_PUBLIC_WHATSAPP_NUMBER   --value 962792841696
eas env:create --environment production --name EXPO_PUBLIC_CLIQ_ALIAS        --value <the academy's CliQ alias>
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN        --value <the Sentry DSN>
eas env:create --environment production --name EXPO_PUBLIC_EAS_PROJECT_ID    --value <the EAS project id>
eas env:create --environment production --name EXPO_PUBLIC_PASSWORD_RESET_URL --value https://<owner>.github.io/professional-of-badminton/reset-password/
```

`EXPO_PUBLIC_*` values are inlined into the JavaScript bundle and are readable
by anyone with the app, which is correct for all six: the anon key is public by
design and Row Level Security is the boundary (section 7). The service role key
is never among them — it exists only as an Edge Function secret (2.5).

## Sentry source maps

Three more variables, needed only so a crash report shows a line of TypeScript
rather than a line of minified bundle. `expo config` warns about the first two
until they exist; the warning is harmless and the build succeeds without them.

```
eas env:create --environment production --name SENTRY_ORG          --value <sentry org slug>
eas env:create --environment production --name SENTRY_PROJECT      --value <sentry project slug>
eas env:create --environment production --name SENTRY_AUTH_TOKEN   --value <token> --type secret --visibility secret
```

`SENTRY_AUTH_TOKEN` is a build-time secret rather than a public variable: it can
upload artefacts to the Sentry project and must never be an `EXPO_PUBLIC_*`
value, because those are inlined into the bundle.

`EXPO_PUBLIC_SENTRY_DSN` is different and _is_ public — a DSN can only accept
events, and it has to be in the bundle for the app to send one.
