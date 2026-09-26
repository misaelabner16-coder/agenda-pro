-- Logical snapshot only: no permanent writes. Output must be encrypted, not logged.
begin;
set local statement_timeout = '30s';
create temporary table security_snapshot_data (table_name text, rows jsonb);
do $$
declare item record; payload jsonb;
begin
  for item in select schemaname, tablename from pg_tables
    where schemaname='public' or (schemaname='auth' and tablename in ('users','identities'))
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t',item.schemaname,item.tablename) into payload;
    insert into security_snapshot_data values (item.schemaname||'.'||item.tablename,payload);
  end loop;
end; $$;
select jsonb_build_object(
  'project_ref','nuhxuhkunhuzljjjkzbx',
  'captured_at',now(),
  'data',(select jsonb_object_agg(table_name,rows) from security_snapshot_data),
  'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
  'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'),
  'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
  'table_acls',(select jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'acl',c.relacl,'rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
  'columns',(select jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'column',a.attname,'acl',a.attacl,'not_null',a.attnotnull,'type',format_type(a.atttypid,a.atttypmod))) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped),
  'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))),
  'migrations',(select jsonb_agg(to_jsonb(m)) from supabase_migrations.schema_migrations m)
) as snapshot;
rollback;
