# Security release: external checks still required

This checklist does not assert that a dashboard option is enabled merely because code
exists. Database: São Paulo `nuhxuhkunhuzljjjkzbx`. Public app URL unchanged.

## Release procedure (completed 2026-09-27; retain for reference)

Application commit `bb0a131` is live at the unchanged public URL, deployment
`6Z6V8xsQiGHKxSQZUbrBu5mZr9D4`. The initial build rejected a Supabase URL incorrectly
configured as `NEXT_PUBLIC_SITE_URL`; the operator corrected it and redeployed.
The guarded Vercel booking flow passed before and after direct-writer retirement.
Migration `20260927002839` is applied, preserving all 15 preceding ledger entries.
Post-activation HTTP checks: 32 passed, including both old writers denied to anon
and authenticated users. Browser checks: 16 passed, no normal runtime errors.
Only generated test records were removed; existing data and Canada were untouched.
The deployment/Supabase skills informed the staged release and post-change verification.

1. Supabase São Paulo > Project Settings > API Keys: obtain a **secret** key for this
   project. In Vercel Agenda Pro > Settings > Environment Variables, add
   `SUPABASE_SECRET_KEY`, type **Secret**, scope **Production only**. Never put it in
   `NEXT_PUBLIC_*`, Git, screenshots, chat or Preview. No credential was persisted by
   the test scripts: the local test server received it only in its process environment.
2. Confirm Production variables: `NEXT_PUBLIC_SUPABASE_URL` points to São Paulo,
   public/publishable key belongs to the same project, `NEXT_PUBLIC_SITE_URL` is
   `https://agenda-pro-lovat.vercel.app`. No `SECURITY_LOCAL_BOOKING_TEST` on Vercel.
3. Preview must use a separate test project/key, never the production database. The
   guard now intentionally blocks a Preview configured with production. A separate test
   project has NOT been provisioned. The existing local `.env.local` was preserved,
   but its retired Canadian target is now blocked. Replace it with test configuration;
   temporary access to production for explicit tests requires
   `ALLOW_PRODUCTION_DATABASE_FOR_TESTS=1` locally. Do not set `VERCEL_ENV=production`
   to bypass this during normal development (our isolated production-build tests do
   explicitly emulate that environment with credentials supplied in memory).
4. Publish the gateway-compatible code; validate booking from the actual Vercel host.
   Confirm `x-vercel-forwarded-for` reaches the function. Missing/invalid trusted IP or
   missing server credential returns 503, never falls back to an unguarded writer.
5. Only after that validation, apply `20260927002839_security_phase5_retire_direct_booking.sql`
   and record its version without modifying old migration history. This step is now
   complete. Both anonymous/authenticated direct calls were denied and website booking,
   rescheduling and cancellation passed after activation. Do not replay the migration.

## Supabase dashboard

- Authentication > Providers / Email: confirm email confirmation is required, password
  policy and leaked-password protection. The security advisor reported leaked-password
  protection disabled; availability may depend on plan. Do not weaken the setting to
  silence an alert. Confirm Auth rate limits, SMTP sender and real delivery/confirmation.
- Authentication > URL Configuration: production Site URL is the app, not the Supabase
  API. Review redirect allowlist; prefer exact production callback URLs, no broad
  attacker-controlled wildcard. Keep local callbacks out of production when unnecessary.
- Organization/account security: MFA for Supabase/Vercel/GitHub administrators, least
  privilege, review active sessions and integrations. Global app-admin membership must
  be explicitly controlled; no automatic grants from mutable profile metadata.
- Database backups: the local encrypted logical snapshots are a contingency, NOT a
  tested full restore. Select an automated backup/retention policy and demonstrate a
  restore to a separate project before real customer data. Storage/platform settings
  are not in these snapshots. DPAPI recovery needs the original Windows account/profile.
- Infrastructure: database currently reported PostgreSQL 17.6. Review available security
  maintenance updates with Supabase; preserve/exercise the professional exclusion index
  and follow provider reindex guidance when upgrading. No infrastructure upgrade was
  performed. `btree_gist` in public was an advisor warning; moving it blindly could break
  the scheduling constraint. Plan it separately with dependency checks.
- Security Advisor: review remaining SECURITY DEFINER entries with explicit narrow grants
  and function-level authorization. Their existence alone is not a reason to remove
  required public RPCs or disable RLS.

## Vercel and GitHub

- Confirm project Functions region São Paulo (`gru1` in versioned vercel.json). A public
  HEAD response showed `gru1`, but that alone does not verify every function's execution.
- Confirm deployment protection for Preview, environment-scoped secrets, project member
  permissions and rollback access. No authenticated Vercel/GitHub configuration audit
  was available in this run.
- Inspect access logs/analytics/drains for `/p/*/agendamento/*`, API equivalents and Auth
  callback query strings. Redact or exclude private tokens, restrict operator access and
  set retention. Application logs omit raw errors/PII; they cannot control provider access
  logs, browser history, screenshots or clipboard. Treat a copied private URL as a password.
- Configure WAF/request-volume alerts as additional protection. Database quotas are shared
  and cannot be bypassed by calling the public writer after retirement, but distributed
  low-rate abuse and unverified phone identity remain. CAPTCHA/phone verification may be
  needed if abuse occurs; neither is silently claimed implemented.
- GitHub: check branch protection/review requirements, secret scanning/push protection,
  dependency alerts and minimum workflow permissions. No repository settings were changed.

## Logs, retention and rollback limitations

- Database audit rows capture actor, tenant, operation and whitelisted metadata. No names,
  phone numbers, emails, reasons, passwords or token hashes are copied into new audit rows.
  Existing logs were preserved, not silently scrubbed. Provider/Auth logs need separate review.
- Audit writes are atomic with business changes; failures roll back the action. API roles
  cannot edit/delete the audit trail. Database administrators can still alter it. Existing
  organization-delete CASCADE also deletes that tenant's logs: use an external retained
  export if immutable forensic retention is required. No new tenant-delete action added.
- Private booking read token expires 30 days after the appointment ends, or after cancellation
  for cancelled appointments. History remains visible to authorized professionals. There is
  no identity-verified self-service recovery/rotation yet; do not replace it with phone-only lookup.
- Code rollback: use the isolated commits, but after direct-writer retirement NEVER roll
  back to an anonymous-writer application build or loosen grants to restore service. Keep
  a gateway-compatible build or temporarily suspend new reservations while rolling forward.
- Schema rollback: no applied historical migration was edited/deleted. Back out a problem
  with a reviewed additive forward migration; do not delete customer data or recreate old
  vulnerable policies. Ordinary `db push` remains blocked by historic ledger divergence;
  do not use `--include-all` or mark old migrations reverted.

**Current release assessment: application release, direct-writer retirement and production
smoke tests completed. NOT cleared for real customer data until the external backup/restore,
Auth, administrative access, provider logs and infrastructure checks above are verified.**
