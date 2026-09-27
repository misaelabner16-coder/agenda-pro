# Security remediation — phased status

## Phase 1: authorization and isolation

Branch: `codex/security-hardening`. Base: `9e42932`.

Prepared migration: `20260925230540_security_phase1_authorization.sql`.
**Applied to São Paulo on 2026-09-26 after explicit approval. No application deployment performed.**

Changes:

- Membership and active-organization checks now apply to every schedule access path,
  including a professional whose user ID still matches after membership removal.
- Retired legacy business-based policies without dropping their tables or rows.
- Removed direct INSERT/UPDATE of events and direct writes to appointment series.
  DELETE remains authorized only for blocks; bookings use cancellation RPCs.
- Removed inherited table/column access to profile email; full_name editing remains.
- New global-admin RPC grants access by an exact, confirmed Auth email, not profiles.email.
- Display email follows subsequent Auth email changes.
- Membership/professional reads no longer bypass membership revocation.

### Executed evidence (São Paulo, 2026-09-26)

Project: `nuhxuhkunhuzljjjkzbx`, PostgreSQL 17.6.

1. The regression suite against the unmodified database failed as expected at
   `Legacy business cannot authorize B service`: the cross-tenant INSERT was accepted.
   The exception rolled the entire fixture transaction back.
2. Candidate migration plus fixtures ran in a single transaction ending in ROLLBACK:
   **49 checks passed**, including A/B isolation, removed professional, anonymous access,
   immutable profile email, forged display email, confirmed Auth lookup and event grants.
3. The SQL revocation test keeps the same request JWT subject before and after removal.
   Subsequently, `scripts/security-session-test.mjs` passed **11 HTTP checks** with two
   temporary Auth accounts: real password login and onboarding, A/B isolation, forbidden
   writes, membership deletion and reuse of the exact previously issued signed JWT.
   That JWT immediately lost schedule reads, professional reads, helper access and block
   deletion rights. Both temporary organizations and Auth users were removed afterward.
   Admin credentials were used only for fixture lifecycle, never authorization assertions.
4. **10 existing Node tests passed**; TypeScript (`--noEmit --incremental false`),
   ESLint and `git diff --check` passed.
5. Follow-up database query found **0 persisted audit fixture organizations**,
   **0 inconsistent profile/Auth emails**, and confirmed the old policy still exists
   because the candidate execution was rolled back.
6. Permanent application via `scripts/apply-security-phase1.ps1 -ConfirmApply` preserved
   all **11 historical ledger entries**, recording only `20260925230540` atomically.
   The **49 SQL checks passed again against the applied schema**, without candidate DDL.
7. Security advisors ran: callable SECURITY DEFINER APIs require the documented explicit
   authorization checks (do not remove needed grants merely to silence warnings).
   Remaining external findings include leaked-password protection disabled and
   `btree_gist` in public; assess these in hardening, preserving the exclusion constraint.

Commands:

```powershell
./scripts/security-sql.ps1 -SqlFile ./supabase/tests/security_phase1.test.sql `
  -CandidateMigration ./supabase/migrations/20260925230540_security_phase1_authorization.sql
```

After a permanent application, run the same suite without `-CandidateMigration`.
It always rolls back its randomly named fixtures. Do not test RLS as service_role.

### Snapshot and deployment prerequisite

A logical snapshot of application data, Auth users/identities, functions, policies,
constraints, ACLs, columns, triggers and migration ledger was saved at:

`C:\Users\misael\AppData\Local\AgendaPro\SecurityBackups\sao-paulo-20260926-160406.dpapi`

It is protected by Windows DPAPI for the current Windows user. Encryption/decryption
round-trip was verified. This is NOT a complete Supabase physical backup and has NOT
been restored into a separate database. Storage files/platform configuration are not
included. Keep this artifact private; do not commit or upload its plaintext contents.

`supabase db push --dry-run --skip-vault` failed because the historical remote migration
versions differ from the local filenames:

| Name | Local version | Remote version |
|---|---|---|
| stage3_booking_management | 20260921003735 | 20260921005902 |
| tighten_function_permissions | 20260921010312 | 20260921010452 |
| revoke_trigger_function_access | 20260921010839 | 20260921010902 |
| allow_professionals_to_manage_customers | 20260921011437 | 20260921011516 |

The first two schema scripts also do not appear in the remote ledger. Their objects
exist, consistent with the earlier manual setup. Do NOT mark the existing entries as
reverted, replay initial migrations, use `--include-all`, or rename old applied files
just to silence the CLI. No historical migration/ledger entry was changed here.

Deployment route used: apply only the NEW reviewed migration and record its
new version atomically, preserving the old ledger. The post-application suite passed.
The new admin action is committed in `f65eee3`; it is not yet published to Vercel.
Ordinary `db push` remains blocked until the historic baseline is reconciled separately.

### Remaining work

- Publish the matching admin application action with the reviewed application release.
- Phase 2: schedule integrity, snapshots, recurrence, series FK and concurrency.
- Phase 3: redirect, headers, private links, inputs and controlled errors.
- Phase 4: targeted dependency update and full build checks.
- Phase 5: abuse protection covering direct RPC, not just Vercel.
- Phase 6: audit logs, privacy, environment separation and operational checklist.

## Phase 2: booking integrity

Migration `20260926191023_security_phase2_booking_integrity.sql` applied to São Paulo
after rollback-only regression validation, preserving all 12 prior ledger entries.
Pre-application encrypted snapshot: `sao-paulo-20260926-161745.dpapi` in the directory above.

- B1: shared internal availability calculation uses the reservation's original duration
  and professional when rescheduling; the UI now calls a token-authorized availability
  endpoint. Price/duration/name snapshots remain unchanged. Service edits cannot cause
  a shorter availability check followed by a longer reservation crossing closing time.
- B3: public booking reuses the normalized-phone customer without overwriting CRM name;
  submitted name is retained in the reservation snapshot only.
- B4: cancellation, rescheduling and series cancellation acquire locks in the same
  professional-before-row order and re-read status. Duplicate cancellation cannot
  generate duplicate transition logs.
- B5: composite tenant/series FK; non-null snapshot duration and price checks.
- Recurrence: professional lock plus availability recheck in the internal writer;
  explicit null-input checks and whole-transaction rollback on any conflicting occurrence.
- Existing professional-level exclusion constraint retained, with cancellation logical.
- A5/antiabuse is **not resolved by integrity checks**; remains Phase 5.

Evidence: **49 Phase 1 + 28 Phase 2 SQL checks passed after application**, with rollback.
The extended signed-session HTTP test passed **19 checks**, including two truly concurrent
anonymous direct-RPC bookings (one success, one `23P01`), one customer/booking afterward,
simultaneous cancellation (one success, one final-state rejection, one audit entry), and
another professional allowed in the same unit/time. Temporary fixtures were removed.
TypeScript and ESLint passed. The reschedule UI/route changes are not deployed yet.

## Phase 3: web security

- B2: redirect validation rejects protocol-relative, backslash/encoded-backslash and
  control-character destinations; confirmation accepts only supported OTP types.
- B7: per-request 256-bit CSP nonce, strict-dynamic scripts without unsafe-inline/eval
  in production, framing/object/base restrictions, nosniff, permissions/referrer headers.
  Root rendering is now request-based so nonce-bearing HTML cannot be statically reused.
  Tradeoff: the landing page also renders dynamically; existing inline calendar styles
  remain allowed (not inline scripts). HSTS is already supplied by Vercel.
- B8: management/auth/API responses no-store, no-referrer, noindex; private booking page
  has matching metadata. Provider/CDN URL-log retention/redaction remains an external
  operational check: bearer tokens are still present in the existing private URL format.
- B9/B10: bounded streaming JSON reader rejects null, arrays, malformed/oversized bodies,
  non-JSON and cross-origin browser mutations. UUID/date/timezone/slug/reason checks;
  password whitespace preserved; signup/resend messages neutral, email removed from
  generated redirect URLs. Invalid/overflowing service prices return a controlled error.
- Reviewed client source for unsafe HTML/eval sinks and credential storage: no such HTML
  sinks found; localStorage is used only for tutorial dismissal, not management tokens.
  Server-side authorization still applies independently of all client controls.

Evidence: **18 Node tests passed**, TypeScript/lint checks, production build, and
**16 browser checks** against the local production build connected to São Paulo.
Browser checks cover responsive login/navigation/password toggle, nonce/header delivery,
distinct nonces, actual HTML-injected script blocked, JSON null => 400, foreign Origin =>
403 and impossible date => 400. Normal navigation produced no runtime/CSP errors.
The initial DevTools-evaluation injection probe was invalid for testing untrusted HTML;
it was replaced by HTML-response injection under the unmodified response CSP.
The first build hit a Windows telemetry-file EXDEV error; disabling telemetry fixed it.

## Phase 4: targeted dependency hardening

Next.js and eslint-config-next updated from 16.3.5 to **16.3.6**, the vendor patch
for GHSA-vcvr-r3jv-pc5j (ImageResponse/next-og). No application use of next/og was
found, but the vulnerable dependency was removed. React and unrelated dependencies
were not upgraded. Framework advertising header disabled.

Evidence: **19 unit tests**, lint, TypeScript and production build passed; **16 browser
security checks** passed again on Next 16.3.6, with zero normal-navigation errors.
The mobile login screenshot was inspected. pnpm audit reported **0 vulnerabilities
across 443 dependencies**; this does not replace checking vendor advisories.
The dependency regression test pins the reviewed minimum version and matching lint package.
PNPM 11 verification uses the same CI/store settings as installation; no verification bypass.

Vendor advisory: https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j

## Phase 5: database-backed booking antiabuse

Prepared gateway migration `20260927002836_security_phase5_booking_gateway.sql` is
**applied to São Paulo** (14 ledger entries, old entries preserved). Encrypted preflight
snapshot: `sao-paulo-20260927-075046.dpapi`. A CLI update notice initially interrupted
JSON parsing; the operation stopped before DDL, parsing was corrected, then retried.

The new server-only booking client invokes one privileged guarded RPC. Credentials are
not passed to components or user cookies. Trusted Vercel IP is HMAC-hashed; IPv6 /64
grouping avoids interface-address rotation. Shared atomic database limits: 10 attempts
per IP/minute, 100 per IP/day, 10 per establishment/phone/hour. Failed booking attempts
also consume quota, without partial bookings. Expired counter cleanup is bounded.
No new service, Docker, Redis or client account was introduced. Phone identity is still
unverified; distributed low-rate abuse remains a risk (consider CAPTCHA/verification
if observed). This is rate limiting, not a guarantee that all automation is stopped.

**Activation migration `20260927002839_security_phase5_retire_direct_booking.sql` is
NOT applied.** It revokes both old direct writers from anon/authenticated/service_role.
The guarded function retains the only service_role entry point and invokes the writers
internally. Applying retirement before the matching application release would break
the current production booking route. Do not apply all pending migrations blindly.

Evidence: **22 unit tests**, lint/TypeScript/build, **19 SQL checks** for limits and
all direct bypass paths under anon/authenticated (candidate retirement + rollback),
**28 signed-session/HTTP checks**, **16 browser checks**. The HTTP run proved the
actual new API creates, displays, reschedules and cancels a booking and frees old slots.
Two concurrent bookings produced one success; 12 concurrent invalid gateway requests
produced exactly 10 attempts and 2 rate-limit responses. All random fixtures removed.
The Phase 2 fixture setup now invokes the internal writer as setup only; its anonymous
reschedule/cancel assertions remain unchanged. Phase 5 explicitly tests writer grants.

### Safe release order (requires Vercel configuration)

1. In Vercel Agenda Pro > Settings > Environment Variables, add `SUPABASE_SECRET_KEY`
   as a **Secret**, scoped to **Production only**, from the São Paulo project's secret
   API key. Never use a NEXT_PUBLIC prefix, never paste the value in chat. Do not copy
   this key to Preview/Development. The legacy service_role key also works server-side;
   the new secret key is preferred. `SECURITY_LOCAL_BOOKING_TEST` must remain unset there.
2. Publish the reviewed app with the gateway (and remaining Phase 6 fixes), confirm a
   controlled booking through the production website, and check the trusted IP header.
3. Apply only the retirement migration, then prove direct anonymous/authenticated RPC
   requests fail and the website booking still succeeds. No loosening grants to pass tests.
4. Do not roll the app back to an anonymous-writer build after retirement. Roll forward
   a gateway-compatible fix or temporarily stop new bookings; never restore the bypass.

Vercel trusted header reference: https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
Supabase key reference: https://supabase.com/docs/guides/api/api-keys

## Phase 6: audit, privacy and environment separation

Migration `20260927105655_security_phase6_audit_and_token_lifetime.sql` **applied** to
São Paulo after rollback-only tests, with encrypted snapshot
`sao-paulo-20260927-080655.dpapi`. All 14 previous ledger entries preserved (15 now).

- Eleven database triggers capture critical changes, including direct authorized API
  edits, membership revocation, service/hour/block changes and booking creation.
  Actor comes from authenticated context; before/after data is whitelisted. API roles
  cannot write or delete audit rows. Personal values, reasons and token hashes excluded.
- Private read access expires 30 days after an appointment ends or is cancelled; future
  reservations remain accessible, professional history is preserved. UI explains validity.
  Token recovery/rotation and provider URL-log retention are still operational limitations.
- Validated database text bounds and matching server form checks prevent oversized input;
  no existing data was trimmed/deleted. Real dates, clock values, UUIDs and email lengths
  are checked before actions. Raw database messages and whole error objects removed from
  application/browser logs; regression scans protect these log sites.
- Canada is blocked in every environment. Production must use São Paulo; Preview cannot
  share production; local production access needs explicit temporary opt-in. Auth email
  redirect origin rejects Supabase URLs and malformed/unsafe application origins.
  Existing `.env.local` was preserved, so ordinary local startup now intentionally stops
  until its retired configuration is replaced. No test connected to Canada.
- Added the external operational/release checklist in `security-operations-checklist.md`.
  Supabase/Next.js, environment, React and observability guidance informed narrow grants,
  server-only credential separation and minimal non-sensitive logs; no telemetry vendor
  or other infrastructure dependency was introduced.

The first candidate expiry definition used an older return signature; PostgreSQL rejected
it and rolled back. The effective live signature was inspected and its service_id and
can_reschedule outputs preserved. The corrected candidate and applied version passed.

### Final executed verification (2026-09-27)

| Verification | Result |
|---|---|
| pnpm test | 26 passed |
| Phase 1 SQL: isolation, RLS, revocation, legacy policies | 62 passed |
| Phase 2 SQL: scheduling, snapshots, recurrence | 28 passed |
| Phase 5 SQL: quotas/direct bypass, retirement in ROLLBACK | 19 passed |
| Phase 6 SQL: audit, expiry, database input bounds | 17 passed |
| Signed-JWT/HTTP integration + concurrent requests + real app API flow | 28 passed |
| Production-build browser checks (mobile, hydration, CSP/XSS, bad requests) | 16 passed |
| Compiled browser bundle scan | 24 assets, no privileged credentials detected |
| pnpm lint / TypeScript / pnpm build | Passed |
| git diff --check | Passed |
| Effective public tables without RLS | 0 |
| Effective enabled audit triggers | 11 |

The last HTTP run repeated login/onboarding, A/B access denial, removal with reuse of the
same signed JWT, true simultaneous booking/cancellation, atomic quotas, and the application
API create/read/reschedule/cancel flow. All generated tenants/users/quota fixtures removed.
Database fixtures in SQL suites always rolled back. Existing test/customer data preserved.

### Finding-to-evidence summary

| Finding | Correction | Regression evidence | Commit |
|---|---|---|---|
| A1 | Current membership required even for linked professional | SQL + same signed JWT after revocation | f65eee3, 20695f7 |
| A2 | Legacy policies/grants retired, rows retained | Populated A/B fixtures and forbidden cross-tenant write | f65eee3, 4baabca |
| A3 | Direct booking writes/hard deletion blocked | Column/table grants and signed HTTP mutation denial | f65eee3 |
| A4 | Confirmed Auth identity, immutable profile email | Forged profile and unconfirmed email rejected | f65eee3 |
| A5 | Server gateway + atomic DB quotas + staged direct-writer retirement | 19 SQL + concurrent quota HTTP; activation still pending | 0754f09 |
| B1 | Original duration/professional reschedule validation | Shorter/longer service, blocks, closing-time cases | c4ec533 |
| B2 | Strict internal redirect validation | Encoded slash/backslash, foreign origin cases | 34e5361 |
| B3 | Public booking cannot rename CRM customer | Normalized-phone reuse with independent snapshot | c4ec533 |
| B4 | Common lock order and state recheck | Simultaneous cancellation, single semantic audit entry | c4ec533 |
| B5 | Tenant/series FK and snapshot constraints | Cross-tenant series, null snapshots rejected | c4ec533 |
| B6 | Atomic audit triggers, protected writes, minimal data | Actor/diff, revocation, privacy and cascade tests | Phase 6 commit |
| B7 | CSP nonce, frame/nosniff/referrer headers | Real browser rejects injected script | 34e5361 |
| B8 | No-store/noindex/no-referrer, expiry, reduced logs | Header, token lifetime and log/bundle tests | 34e5361 + Phase 6 commit |
| B9 | Neutral public messages, exact password, typed/bounded input | Unit, malformed requests, DB constraint tests | 34e5361 + Phase 6 commit |
| B10 | JSON must be a bounded non-null object | JSON null returns 400 in browser/API test | 34e5361 |
| B11 | Next.js 16.3.6, minimal related patch | Dependency regression, build, audit | 987f0ff |
| B12 | Environment guards and explicit local opt-in | Canada/Preview/local separation tests | Phase 6 commit |

### Production distinction and current verdict

No application push/deployment was performed. Public production HEAD still returned
the old header set (HSTS and X-Powered-By, no new CSP), HTTP 200, and Vercel `gru1` routing.
That is not proof of every function's region. The old direct booking RPC remains callable
until the coordinated release; the guarded RPC is already inaccessible to anon.

**Would I put real customer data into the currently published application? NO.**
Code/database evidence is substantially stronger, but release/retirement activation and
production smoke checks are pending. Backup restore, administrative MFA, environment
scopes, Auth protection/email delivery, infrastructure token-log handling and repository
access controls require the external checks listed separately. Passing tests is not a
claim that every possible vulnerability is absent. Do not mark the overall task complete.
