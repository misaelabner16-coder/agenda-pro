-- Run in a transaction with ROLLBACK. Only randomly named fixtures are touched.
begin;
set local statement_timeout = '30s';
create temporary table security_ids (name text primary key, id uuid not null default gen_random_uuid());
insert into security_ids(name) values ('user_a'),('user_b'),('professional_user'),('admin'),('candidate'),
  ('org_a'),('org_b'),('loc_a'),('loc_b'),('pro_a'),('pro_b'),('service_a'),('service_b'),
  ('customer_a'),('customer_b'),('event_a'),('event_b'),('legacy_a'),('block_a');
create temporary table security_results (test text primary key, passed boolean not null);
grant select,insert on security_ids to authenticated, anon;
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


-- Additional fixtures retain the existing checks/helpers and rollback everything.
insert into public.professional_services(organization_id,professional_id,service_id) values
  (pg_temp.sid('org_a'),pg_temp.sid('pro_a'),pg_temp.sid('service_a')),
  (pg_temp.sid('org_b'),pg_temp.sid('pro_b'),pg_temp.sid('service_b'));
insert into public.location_hours(organization_id,location_id,week_day,start_time,end_time)
select pg_temp.sid('org_a'),pg_temp.sid('loc_a'),d,'09:00','12:00' from generate_series(0,6) d;
insert into public.professional_hours(organization_id,location_id,professional_id,week_day,start_time,end_time)
select pg_temp.sid('org_a'),pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),d,'09:00','12:00' from generate_series(0,6) d;
update public.services set duration_minutes=60 where id=pg_temp.sid('service_a');
create temporary table booking_test(id uuid,token text);
grant all on booking_test to anon,authenticated;
create function pg_temp.booking_time(p_time time,p_days integer default 30) returns timestamptz language sql as $$
 select ((current_date+p_days)+p_time) at time zone 'America/Sao_Paulo';
$$;
-- Fixture creation uses the server-only writer after phase 5 retires direct access.
-- Anonymous authorization and bypass denial are exercised in security_phase5.test.sql.
insert into booking_test
select * from public.book_public_appointment_with_management('audit-'||pg_temp.sid('loc_a'),
  pg_temp.sid('service_a'),pg_temp.booking_time('09:00'),'Untrusted public name','(11) 90000-0001');
select pg_temp.check_security('Public booking cannot overwrite CRM name',
  (select name='Customer A' from public.customers where id=pg_temp.sid('customer_a')));
select pg_temp.check_security('Submitted name retained only in booking snapshot',
  (select customer_name='Untrusted public name' from public.calendar_events where id=(select id from booking_test)));
select pg_temp.check_security('Public booking reuses normalized phone customer',
  (select count(*)=1 from public.customers where organization_id=pg_temp.sid('org_a') and phone='11900000001'));
update public.services set duration_minutes=30,price_cents=9999 where id=pg_temp.sid('service_a');
set local role anon;
select pg_temp.check_security('New shorter service offers 11:30',exists(
  select 1 from public.get_available_slots('audit-'||pg_temp.sid('loc_a'),pg_temp.sid('service_a'),current_date+30)
  where starts_at=pg_temp.booking_time('11:30')));
select pg_temp.check_security('Original 60-minute booking does not offer 11:30',not exists(
  select 1 from public.get_public_reschedule_slots('audit-'||pg_temp.sid('loc_a'),(select token from booking_test),current_date+30)
  where starts_at=pg_temp.booking_time('11:30')));
select pg_temp.denied('Reschedule cannot overrun closing time after service changed',format(
  'select public.reschedule_public_booking(%L,%L,%L)','audit-'||pg_temp.sid('loc_a'),
  (select token from booking_test),pg_temp.booking_time('11:30')),'23P01');
select pg_temp.denied('Wrong tenant slug cannot use management token',format(
  'select public.get_public_reschedule_slots(%L,%L,current_date+30)','audit-'||pg_temp.sid('loc_b'),
  (select token from booking_test)),'P0002');
select pg_temp.denied('Private availability helper is not public',
  format('select public.available_slots_for_booking(%L,%L,%L,current_date+30,1,null)',
  pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),pg_temp.sid('service_a')));
reset role;
select pg_temp.check_security('Failed reschedule leaves old time and status intact',
  (select starts_at=pg_temp.booking_time('09:00') and status='confirmed' from public.calendar_events where id=(select id from booking_test)));
-- Test a recurring lunch block against the full original duration.
insert into public.availability_blocks(organization_id,location_id,professional_id,week_days,start_time,end_time)
values(pg_temp.sid('org_a'),pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),array[0,1,2,3,4,5,6]::smallint[],'10:30','11:00');
set local role anon;
select pg_temp.denied('Reschedule respects blocks for the full snapshot duration',format(
  'select public.reschedule_public_booking(%L,%L,%L)','audit-'||pg_temp.sid('loc_a'),
  (select token from booking_test),pg_temp.booking_time('10:00')),'23P01');
reset role;
delete from public.availability_blocks where organization_id=pg_temp.sid('org_a');
set local role anon;
select public.reschedule_public_booking('audit-'||pg_temp.sid('loc_a'),(select token from booking_test),pg_temp.booking_time('10:00'));
select pg_temp.check_security('Successful reschedule frees old slot',exists(
  select 1 from public.get_available_slots('audit-'||pg_temp.sid('loc_a'),pg_temp.sid('service_a'),current_date+30)
  where starts_at=pg_temp.booking_time('09:00')));
reset role;
select pg_temp.check_security('Reschedule preserves original duration and price',
  (select service_duration_minutes=60 and service_price_cents=2500 and ends_at=pg_temp.booking_time('11:00')
  from public.calendar_events where id=(select id from booking_test)));
update public.services set duration_minutes=120 where id=pg_temp.sid('service_a');
set local role anon;
select pg_temp.check_security('Longer current service does not hide valid original-duration slots',exists(
 select 1 from public.get_public_reschedule_slots('audit-'||pg_temp.sid('loc_a'),(select token from booking_test),current_date+30)
 where starts_at=pg_temp.booking_time('11:00')));
reset role;
update public.services set duration_minutes=30 where id=pg_temp.sid('service_a');
update public.locations set default_professional_id=null where id=pg_temp.sid('loc_a');
set local role anon;
select pg_temp.check_security('Reschedule retains original professional when default changes',exists(
 select 1 from public.get_public_reschedule_slots('audit-'||pg_temp.sid('loc_a'),(select token from booking_test),current_date+30)
 where starts_at=pg_temp.booking_time('11:00')));
reset role;
update public.locations set default_professional_id=pg_temp.sid('pro_a') where id=pg_temp.sid('loc_a');
select pg_temp.denied('Snapshot duration cannot be NULL',format(
  'update public.calendar_events set service_duration_minutes=null where id=%L',(select id from booking_test)),'23514');
select pg_temp.denied('Snapshot price cannot be NULL',format(
  'update public.calendar_events set service_price_cents=null where id=%L',(select id from booking_test)),'23514');
insert into public.appointment_series(organization_id,location_id,professional_id,customer_id,service_id,frequency,starts_on,start_time)
values(pg_temp.sid('org_b'),pg_temp.sid('loc_b'),pg_temp.sid('pro_b'),pg_temp.sid('customer_b'),pg_temp.sid('service_b'),'weekly',current_date+30,'09:00');
insert into security_ids(name,id) select 'series_b',id from public.appointment_series where organization_id=pg_temp.sid('org_b');
select pg_temp.denied('Booking cannot reference another tenant series',format(
  'update public.calendar_events set series_id=%L where id=%L',
  (select id from public.appointment_series where organization_id=pg_temp.sid('org_b')),(select id from booking_test)),'23503');
set local role anon;
select public.cancel_public_booking('audit-'||pg_temp.sid('loc_a'),(select token from booking_test),'Fixture cancellation');
select pg_temp.denied('Repeated cancel cannot write another audit entry',format(
  'select public.cancel_public_booking(%L,%L,null)','audit-'||pg_temp.sid('loc_a'),(select token from booking_test)),'P0002');
select pg_temp.check_security('Cancellation makes old slot available',exists(
  select 1 from public.get_available_slots('audit-'||pg_temp.sid('loc_a'),pg_temp.sid('service_a'),current_date+30)
  where starts_at=pg_temp.booking_time('10:00')));
reset role;
select pg_temp.check_security('Cancelled booking retained with actor/time',
  (select status='cancelled' and cancelled_by='customer' and cancelled_at is not null from public.calendar_events where id=(select id from booking_test)));
select pg_temp.check_security('Exactly one customer cancellation audit',
  (select count(*)=1 from public.audit_logs where entity_id=(select id from booking_test) and action='booking.cancelled_by_customer'));
-- Existing B series and A/B memberships also exercise tenant FKs under RLS.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.sid('user_a')::text,true);
select pg_temp.denied('Cannot cancel B series as A',format(
 'select public.cancel_appointment_series(%L)',
 pg_temp.sid('series_b')),'42501');
select pg_temp.denied('Null recurrence input rejected',format(
 'select public.create_customer_and_recurring_booking(%L,%L,''Invalid fixture'',''11900000005'',%L,null,current_date+30,''09:00'',null,2)',
 pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),pg_temp.sid('service_a')),'22023');
insert into security_ids(name,id)
select 'series_a',public.create_customer_and_recurring_booking(pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),
 'Recurring fixture','11900000006',pg_temp.sid('service_a'),'weekly',current_date+30,'09:00',null,2);
reset role;
select pg_temp.check_security('Two recurring occurrences created atomically',
 (select count(*)=2 from public.calendar_events where series_id=pg_temp.sid('series_a')));
set local role authenticated;
select pg_temp.denied('Conflicting recurrence fails as a whole',format(
 'select public.create_customer_and_recurring_booking(%L,%L,''Conflict fixture'',''11900000007'',%L,''weekly'',current_date+23,''09:00'',null,2)',
 pg_temp.sid('loc_a'),pg_temp.sid('pro_a'),pg_temp.sid('service_a')),'23P01');
reset role;
select pg_temp.check_security('Failed recurrence leaves no customer',
 not exists(select 1 from public.customers where organization_id=pg_temp.sid('org_a') and phone='11900000007'));
set local role authenticated;
select public.cancel_appointment_series(pg_temp.sid('series_a'));
reset role;
select pg_temp.check_security('Series cancellation retains both cancelled bookings',
 (select count(*)=2 from public.calendar_events where series_id=pg_temp.sid('series_a') and status='cancelled'));
select pg_temp.check_security('Series cancellation is audited',
 exists(select 1 from public.audit_logs where entity_id=pg_temp.sid('series_a') and action='booking.series_cancelled'));
select jsonb_build_object('suite','security_phase2','passed',count(*),'tests',jsonb_agg(test order by test)) as result from security_results;
rollback;
