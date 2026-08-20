# Professional of Badminton App

Read BUILD-SPEC.md before writing any code. It is the authoritative
specification. This file only records conventions.

## Non-negotiables
- TypeScript strict. No `any`. No `@ts-ignore` without a comment explaining why.
- Money is integer fils (1 JD = 1000 fils). Never float. Use src/lib/money.ts.
- All times are Asia/Amman. Never use `new Date()` for business logic;
  use src/lib/time.ts helpers.
- No hardcoded user-facing strings. Everything through `t()`.
- No browser storage APIs. Use expo-secure-store for tokens, MMKV or
  AsyncStorage for cache.
- Every Supabase read goes through a TanStack Query hook in features/*/queries.ts.
  Screens never call supabase directly.
- Row Level Security is the security boundary. Client-side filtering is
  presentation only, never protection.

## Before you finish a task
- `npm run typecheck` passes
- `npm run lint` passes
- `npm test` passes
- New user-facing strings exist in BOTH en.json and ar.json
- New tables have RLS policies and a migration file

## Do not
- Add libraries not listed in BUILD-SPEC.md section 2.1
- Add features listed in BUILD-SPEC.md section 4
- Refactor across feature folders without being asked
- Write comments that restate the code
