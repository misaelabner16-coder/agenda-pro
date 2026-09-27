param(
  [switch]$ConfirmApply,
  [switch]$ProductionSmokePassed,
  [string]$CliPath = 'C:\Users\misael\AppData\Local\Temp\agenda-pro-supabase-cli-3771594b-4ce3-463b-814b-7c04b50499fb\supabase.exe'
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmApply -or -not $ProductionSmokePassed) {
  throw 'Requires -ConfirmApply and -ProductionSmokePassed after verifying the deployed gateway. Sao Paulo only.'
}
$env:NODE_USE_SYSTEM_CA = '1'
$projectRef = 'nuhxuhkunhuzljjjkzbx'
$migrationPath = Join-Path $PSScriptRoot '../supabase/migrations/20260927002839_security_phase5_retire_direct_booking.sql'
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
  if exists (select 1 from supabase_migrations.schema_migrations where version='20260927002839') then
    raise exception 'Direct-writer retirement already recorded; refusing replay';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version='20260927002836') then
    raise exception 'Gateway preparation migration is missing';
  end if;
  if not has_function_privilege('service_role', 'public.book_public_appointment_guarded(text,uuid,timestamptz,text,text,text,text)', 'execute') then
    raise exception 'Server gateway is not accessible';
  end if;
end `$guard`$;
$body
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20260927002839','security_phase5_retire_direct_booking',array['$quotedMigration']);
do `$guard`$ declare r text; f text; begin
  if exists (select * from previous_security_ledger except select * from supabase_migrations.schema_migrations) then
    raise exception 'Historical ledger changed';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    foreach f in array array[
      'public.book_public_appointment(text,uuid,timestamptz,text,text)',
      'public.book_public_appointment_with_management(text,uuid,timestamptz,text,text)'
    ] loop
      if has_function_privilege(r,f,'execute') then raise exception 'Legacy writer still accessible'; end if;
    end loop;
  end loop;
end `$guard`$;
notify pgrst, 'reload schema';
select '20260927002839' as applied_version, count(*) as preserved_ledger_entries from previous_security_ledger;
commit;
"@
$queryPath = Join-Path ([IO.Path]::GetTempPath()) ('agenda-security-activate-' + [guid]::NewGuid() + '.sql')
try {
  & (Join-Path $PSScriptRoot 'security-sql.ps1') -SqlFile (Join-Path $PSScriptRoot '../supabase/tests/security_snapshot.sql') -EncryptedSnapshot -CliPath $CliPath
  [IO.File]::WriteAllText($queryPath, $query, [Text.UTF8Encoding]::new($false))
  & $CliPath db query --linked --project-ref $projectRef --file $queryPath
  if ($LASTEXITCODE -ne 0) { throw 'Activation failed. Inspect the migration ledger before retrying.' }
} finally {
  if ([IO.File]::Exists($queryPath)) { Remove-Item -LiteralPath $queryPath }
}
