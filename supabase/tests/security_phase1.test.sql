-- Run in a transaction with ROLLBACK. Only randomly named fixtures are touched.
begin;
set local statement_timeout = '30s';
create temporary table security_ids (name text primary key, id uuid not null default gen_random_uuid());
insert into security_ids(name) values ('user_a'),('user_b'),('professional_user'),('admin'),('candidate'),
  ('org_a'),('org_b'),('loc_a'),('loc_b'),('pro_a'),('pro_b'),('service_a'),('service_b'),
  ('customer_a'),('customer_b'),('event_a'),('event_b'),('legacy_a'),('block_a');
create temporary table security_results (test text primary key, passed boolean not null);
grant select on security_ids to authenticated, anon;
grant select, insert on security_results to authenticated, anon;
create function pg_temp.sid(p_name text) returns uuid language sql as $$
  select id from pg_temp.security_ids where name = p_name;
$$;
create function pg_temp.check_security(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'Security regression: %', p_name; end if;
  insert into pg_temp.security_results values (p_name, true);
end;
$$;
create function pg_temp.denied(p_name text, p_sql text, p_state text default '42501') returns void language plpgsql as $$
declare actual_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> p_state then raise; end if;
    perform pg_temp.check_security(p_name, true);
    return;
  end;
  raise exception 'Expected permission denial: %', p_name;
end;
$$;
insert into auth.users(id,email,email_confirmed_at)
select id, 'audit-' || id || '@example.invalid', now() from security_ids
where name in ('user_a','user_b','professional_user','admin','candidate');
insert into public.platform_admins(user_id) values (pg_temp.sid('admin'));
insert into public.organizations(id,name,slug)
select id, 'Security fixture', 'audit-' || id from security_ids where name in ('org_a','org_b');
insert into public.organization_memberships(organization_id,user_id,role) values
  (pg_temp.sid('org_a'),pg_temp.sid('user_a'),'owner'),
  (pg_temp.sid('org_b'),pg_temp.sid('user_b'),'owner'),
  (pg_temp.sid('org_a'),pg_temp.sid('professional_user'),'professional');
insert into public.professionals(id,organization_id,user_id,display_name) values
  (pg_temp.sid('pro_a'),pg_temp.sid('org_a'),pg_temp.sid('professional_user'),'Professional A'),
  (pg_temp.sid('pro_b'),pg_temp.sid('org_b'),pg_temp.sid('user_b'),'Professional B');
insert into public.locations(id,organization_id,name,public_slug,default_professional_id) values
  (pg_temp.sid('loc_a'),pg_temp.sid('org_a'),'Location A','audit-'||pg_temp.sid('loc_a'),pg_temp.sid('pro_a')),
  (pg_temp.sid('loc_b'),pg_temp.sid('org_b'),'Location B','audit-'||pg_temp.sid('loc_b'),pg_temp.sid('pro_b'));
insert into public.location_professionals(organization_id,location_id,professional_id) values
  (pg_temp.sid('org_a'),pg_temp.sid('loc_a'),pg_temp.sid('pro_a')),
  (pg_temp.sid('org_b'),pg_temp.sid('loc_b'),pg_temp.sid('pro_b'));
insert into public.businesses(id,owner_id,name,slug) values
  (pg_temp.sid('legacy_a'),pg_temp.sid('user_a'),'Legacy fixture','audit-'||pg_temp.sid('legacy_a'));
insert into public.services(id,organization_id,name,duration_minutes,price_cents) values
  (pg_temp.sid('service_a'),pg_temp.sid('org_a'),'Service A',30,2500),
  (pg_temp.sid('service_b'),pg_temp.sid('org_b'),'Service B',30,2500);
insert into public.customers(id,organization_id,name,phone) values
  (pg_temp.sid('customer_a'),pg_temp.sid('org_a'),'Customer A','11900000001'),
  (pg_temp.sid('customer_b'),pg_temp.sid('org_b'),'Customer B','11900000002');
insert into public.calendar_events(id,organization_id,location_id,professional_id,event_type,
  starts_at,ends_at,service_id,service_name,service_duration_minutes,service_price_cents,
  customer_id,customer_name,customer_phone)
select pg_temp.sid('event_'||suffix),pg_temp.sid('org_'||suffix),pg_temp.sid('loc_'||suffix),
  pg_temp.sid('pro_'||suffix),'booking',now()+interval '10 days',now()+interval '10 days 30 minutes',
  pg_temp.sid('service_'||suffix),'Snapshot',30,2500,pg_temp.sid('customer_'||suffix),'Snapshot','11900000000'
from (values ('a'),('b')) x(suffix);
insert into public.calendar_events(id,organization_id,location_id,professional_id,event_type,starts_at,ends_at)
values (pg_temp.sid('block_a'),pg_temp.sid('org_a'),pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),
  'block',now()+interval '11 days',now()+interval '11 days 30 minutes');

-- Every foreign-table read test below must have real B rows, never pass merely
-- because the table was empty. These are still transaction-local fixtures.
insert into public.location_hours(organization_id,location_id,week_day,start_time,end_time)
values(pg_temp.sid('org_b'),pg_temp.sid('loc_b'),1,'09:00','12:00');
insert into public.professional_hours(organization_id,location_id,professional_id,week_day,start_time,end_time)
values(pg_temp.sid('org_b'),pg_temp.sid('loc_b'),pg_temp.sid('pro_b'),1,'09:00','12:00');
insert into public.professional_services(organization_id,professional_id,service_id)
values(pg_temp.sid('org_b'),pg_temp.sid('pro_b'),pg_temp.sid('service_b'));
insert into public.appointment_series(organization_id,location_id,professional_id,customer_id,service_id,frequency,starts_on,start_time)
values(pg_temp.sid('org_b'),pg_temp.sid('loc_b'),pg_temp.sid('pro_b'),pg_temp.sid('customer_b'),pg_temp.sid('service_b'),'weekly',current_date+30,'09:00');
insert into public.availability_blocks(organization_id,location_id,professional_id,start_date,end_date,is_all_day)
values(pg_temp.sid('org_b'),pg_temp.sid('loc_b'),pg_temp.sid('pro_b'),current_date+31,current_date+31,true);
insert into public.audit_logs(organization_id,action,entity_type,entity_id)
values(pg_temp.sid('org_b'),'security.fixture','calendar_event',pg_temp.sid('event_b'));
do $$ declare target text; total integer;
begin
  foreach target in array array['customers','services','calendar_events','locations','professionals',
    'organization_memberships','location_professionals','location_hours','professional_hours',
    'professional_services','appointment_series','availability_blocks','audit_logs'] loop
    execute format('select count(*) from public.%I where organization_id=$1',target) into total using pg_temp.sid('org_b');
    perform pg_temp.check_security('B fixture exists: '||target,total>0);
  end loop;
end; $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.sid('user_a')::text,true);
select pg_temp.check_security('A sees own booking',(select count(*)=1 from public.calendar_events where id=pg_temp.sid('event_a')));
do $$ declare target text; total integer;
begin
  foreach target in array array['customers','services','calendar_events','locations','professionals',
    'organization_memberships','location_professionals','location_hours','professional_hours',
    'professional_services','appointment_series','availability_blocks','audit_logs'] loop
    execute format('select count(*) from public.%I where organization_id = $1',target)
      into total using pg_temp.sid('org_b');
    perform pg_temp.check_security('A cannot read B: '||target,total=0);
  end loop;
end; $$;
select pg_temp.denied('A cannot insert service in B',format(
  'insert into public.services(organization_id,name,duration_minutes,price_cents) values (%L,''Forbidden'',30,100)',pg_temp.sid('org_b')));
select pg_temp.denied('Legacy business cannot authorize B service',format(
  'insert into public.services(business_id,organization_id,name,duration_minutes,price_cents) values (%L,%L,''Forbidden'',30,100)',
  pg_temp.sid('legacy_a'),pg_temp.sid('org_b')));
select pg_temp.denied('A cannot insert customer in B',format(
  'insert into public.customers(organization_id,name,phone) values (%L,''Forbidden'',''11988888888'')',pg_temp.sid('org_b')));
with changed as (update public.services set name='Forbidden' where id=pg_temp.sid('service_b') returning id)
select pg_temp.check_security('A cannot update B service',(select count(*)=0 from changed));
with changed as (update public.customers set name='Forbidden' where id=pg_temp.sid('customer_b') returning id)
select pg_temp.check_security('A cannot update B customer',(select count(*)=0 from changed));
with removed as (delete from public.services where id=pg_temp.sid('service_b') returning id)
select pg_temp.check_security('A cannot delete B service',(select count(*)=0 from removed));
select pg_temp.denied('No direct booking update',format('update public.calendar_events set status=''cancelled'' where id=%L',pg_temp.sid('event_a')));
select pg_temp.denied('No direct event creation',format(
  'insert into public.calendar_events(organization_id,location_id,professional_id,event_type,starts_at,ends_at) values (%L,%L,%L,''block'',now(),now()+interval ''1 minute'')',
  pg_temp.sid('org_a'),pg_temp.sid('loc_a'),pg_temp.sid('pro_a')));
with removed as (delete from public.calendar_events where id=pg_temp.sid('event_a') returning id)
select pg_temp.check_security('Own booking cannot be hard deleted',(select count(*)=0 from removed));
with removed as (delete from public.calendar_events where id=pg_temp.sid('block_a') returning id)
select pg_temp.check_security('Existing block removal still works',(select count(*)=1 from removed));
select pg_temp.denied('Profile email is immutable',format('update public.profiles set email=''forged@example.invalid'' where id=%L',pg_temp.sid('user_a')));
with changed as (update public.profiles set full_name='Allowed profile name' where id=pg_temp.sid('user_a') returning id)
select pg_temp.check_security('Profile full_name remains editable',(select count(*)=1 from changed));
select pg_temp.denied('Nonadmin cannot grant access',format('select public.grant_organization_access(%L,%L,''owner'')',
  pg_temp.sid('org_b'),'audit-'||pg_temp.sid('user_a')||'@example.invalid'));
select pg_temp.denied('A cannot call cancel staff for B',format('select public.cancel_booking_as_staff(%L,null)',pg_temp.sid('event_b')));
select set_config('request.jwt.claim.sub',pg_temp.sid('user_b')::text,true);
select pg_temp.check_security('B cannot read A booking',(select count(*)=0 from public.calendar_events where id=pg_temp.sid('event_a')));
select pg_temp.denied('B cannot insert service in A',format(
  'insert into public.services(organization_id,name,duration_minutes,price_cents) values (%L,''Forbidden'',30,100)',pg_temp.sid('org_a')));

-- Same JWT subject before/after revocation: no refresh or session change.
select set_config('request.jwt.claim.sub',pg_temp.sid('professional_user')::text,true);
select pg_temp.check_security('Professional has access before revocation',public.can_access_schedule(pg_temp.sid('org_a'),pg_temp.sid('pro_a')));
reset role;
update public.organization_memberships set is_active=false
where organization_id=pg_temp.sid('org_a') and user_id=pg_temp.sid('professional_user');
set local role authenticated;
select pg_temp.check_security('JWT subject unchanged',auth.uid()=pg_temp.sid('professional_user'));
select pg_temp.check_security('Revoked professional loses helper authorization',not public.can_access_schedule(pg_temp.sid('org_a'),pg_temp.sid('pro_a')));
select pg_temp.check_security('Revoked professional cannot read agenda',(select count(*)=0 from public.calendar_events where organization_id=pg_temp.sid('org_a')));
select pg_temp.check_security('Revoked professional cannot read customers',(select count(*)=0 from public.customers where organization_id=pg_temp.sid('org_a')));
select pg_temp.check_security('Revoked professional cannot read own professional row',(select count(*)=0 from public.professionals where id=pg_temp.sid('pro_a')));
select pg_temp.denied('Revoked professional cannot cancel with old identity',format('select public.cancel_booking_as_staff(%L,null)',pg_temp.sid('event_a')));

-- A forged/stale display email must not determine the recipient of admin access.
reset role;
update public.profiles set email=null where id=pg_temp.sid('candidate');
update public.profiles set email='audit-'||pg_temp.sid('candidate')||'@example.invalid' where id=pg_temp.sid('user_a');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.sid('admin')::text,true);
select public.grant_organization_access(pg_temp.sid('org_b'),'audit-'||pg_temp.sid('candidate')||'@example.invalid','receptionist');
select pg_temp.check_security('Admin grant resolves verified Auth identity',exists(
  select 1 from public.organization_memberships where organization_id=pg_temp.sid('org_b') and user_id=pg_temp.sid('candidate') and role='receptionist'));
select pg_temp.check_security('Forged profile did not receive grant',not exists(
  select 1 from public.organization_memberships where organization_id=pg_temp.sid('org_b') and user_id=pg_temp.sid('user_a')));
select pg_temp.denied('Email wildcards are not identity selectors',format(
  'select public.grant_organization_access(%L,''%%@example.invalid'',''owner'')',pg_temp.sid('org_b')),'P0002');
reset role;
update auth.users set email_confirmed_at=null where id=pg_temp.sid('candidate');
set local role authenticated;
select pg_temp.denied('Unconfirmed Auth email cannot receive access',format(
  'select public.grant_organization_access(%L,%L,''owner'')',pg_temp.sid('org_b'),
  'audit-'||pg_temp.sid('candidate')||'@example.invalid'),'P0002');
select pg_temp.check_security('Event column UPDATE not inherited',not has_column_privilege('authenticated','public.calendar_events','customer_name','UPDATE'));
select pg_temp.check_security('Direct series INSERT revoked',not has_table_privilege('authenticated','public.appointment_series','INSERT'));
reset role;
update public.organizations set is_active=false where id=pg_temp.sid('org_a');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.sid('user_a')::text,true);
select pg_temp.check_security('Suspended organization does not authorize owner',not public.has_organization_role(pg_temp.sid('org_a'),array['owner']::public.organization_role[]));
select pg_temp.check_security('Suspended organization events are hidden',(select count(*)=0 from public.calendar_events where organization_id=pg_temp.sid('org_a')));
set local role anon;
select pg_temp.denied('Anonymous cannot read customers','select * from public.customers');
select pg_temp.denied('Anonymous cannot read events','select * from public.calendar_events');
select pg_temp.denied('Anonymous cannot read profiles','select * from public.profiles');
select pg_temp.denied('Anonymous cannot grant access',format(
  'select public.grant_organization_access(%L,''audit@example.invalid'',''owner'')',pg_temp.sid('org_b')));
reset role;
select jsonb_build_object('suite','security_phase1','passed',count(*),'tests',jsonb_agg(test order by test)) as result from security_results;
rollback;
