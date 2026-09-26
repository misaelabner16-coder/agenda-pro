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

No phase beyond Phase 1 has been implemented. São Paulo now has Phase 1 database
protections; remaining phases and application deployment are still outstanding.
This is not go-live approval and not a completed frontend security review.
