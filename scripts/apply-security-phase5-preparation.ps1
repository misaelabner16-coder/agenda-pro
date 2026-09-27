param(
  [switch]$ConfirmApply,
  [string]$CliPath = 'C:\Users\misael\AppData\Local\Temp\agenda-pro-supabase-cli-3771594b-4ce3-463b-814b-7c04b50499fb\supabase.exe'
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmApply) { throw 'Explicit -ConfirmApply is required. Applies ONLY phase 5 preparation to Sao Paulo.' }
$env:NODE_USE_SYSTEM_CA = '1'
$projectRef = 'nuhxuhkunhuzljjjkzbx'
$migrationPath = Join-Path $PSScriptRoot '../supabase/migrations/20260927002836_security_phase5_booking_gateway.sql'
$migration = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $migrationPath))
$body = [regex]::Replace($migration, '(?im)^\s*(begin|commit);\s*$', '')
$quotedMigration = $migration.Replace("'", "''")
$query = @"
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
lock table supabase_migrations.schema_migrations in exclusive mode;
create temporary table previous_security_ledger on commit drop as
select * from supabase_migrations.schema_migrations;
do `$guard`$ begin
  if exists (select 1 from supabase_migrations.schema_migrations where version='20260927002836') then
    raise exception 'Phase 5 preparation is already recorded; refusing replay';
  end if;
end `$guard`$;
$body
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20260927002836','security_phase5_booking_gateway',array['$quotedMigration']);
do `$guard`$ begin
  if exists (select * from previous_security_ledger except select * from supabase_migrations.schema_migrations) then
    raise exception 'Historical ledger changed';
  end if;
end `$guard`$;
notify pgrst, 'reload schema';
select '20260927002836' as applied_version, count(*) as preserved_ledger_entries from previous_security_ledger;
commit;
"@
$queryPath = Join-Path ([IO.Path]::GetTempPath()) ('agenda-security-apply-' + [guid]::NewGuid() + '.sql')
try {
  # Refresh the encrypted snapshot before any persistent schema change.
  & (Join-Path $PSScriptRoot 'security-sql.ps1') -SqlFile (Join-Path $PSScriptRoot '../supabase/tests/security_snapshot.sql') -EncryptedSnapshot -CliPath $CliPath
  [IO.File]::WriteAllText($queryPath, $query, [Text.UTF8Encoding]::new($false))
  & $CliPath db query --linked --project-ref $projectRef --file $queryPath
  if ($LASTEXITCODE -ne 0) { throw 'Application failed. Inspect migration ledger before any retry.' }
} finally {
  if ([IO.File]::Exists($queryPath)) { Remove-Item -LiteralPath $queryPath }
}


