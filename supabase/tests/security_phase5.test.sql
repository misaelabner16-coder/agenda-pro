begin;
set local statement_timeout='30s';
create temporary table security_results(test text primary key, passed boolean not null);
grant select,insert on security_results to anon,authenticated,service_role;
create function pg_temp.ok(p_name text,p_ok boolean) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'Security regression: %',p_name; end if;
 insert into pg_temp.security_results values(p_name,true);
end $$;
create temporary table fixture as select gen_random_uuid() org,gen_random_uuid() loc,
 gen_random_uuid() pro,gen_random_uuid() svc,gen_random_uuid() usr,
 encode(extensions.gen_random_bytes(32),'hex') ip,encode(extensions.gen_random_bytes(32),'hex') phone;
grant select on fixture to anon,authenticated,service_role;
insert into auth.users(id,email,email_confirmed_at) select usr,'audit-'||usr||'@example.invalid',now() from fixture;
insert into public.organizations(id,name,slug) select org,'Security gateway fixture','audit-'||org from fixture;
insert into public.organization_memberships(organization_id,user_id,role) select org,usr,'owner' from fixture;
insert into public.professionals(id,organization_id,display_name) select pro,org,'Fixture' from fixture;
insert into public.locations(id,organization_id,name,public_slug,default_professional_id)
 select loc,org,'Fixture','audit-'||loc,pro from fixture;
insert into public.location_professionals(organization_id,location_id,professional_id) select org,loc,pro from fixture;
insert into public.services(id,organization_id,name,duration_minutes,price_cents) select svc,org,'Fixture',30,1000 from fixture;
insert into public.professional_services(organization_id,professional_id,service_id) select org,pro,svc from fixture;
insert into public.location_hours(organization_id,location_id,week_day,start_time,end_time)
 select org,loc,d,'09:00','12:00' from fixture cross join generate_series(0,6) d;
insert into public.professional_hours(organization_id,location_id,professional_id,week_day,start_time,end_time)
 select org,loc,pro,d,'09:00','12:00' from fixture cross join generate_series(0,6) d;
create temporary table results(response jsonb);
grant all on results to service_role;
set local role service_role;
insert into results select public.book_public_appointment_guarded('audit-'||loc,svc,
 ((current_date+40)+time '09:00') at time zone 'America/Sao_Paulo','Test customer','11955550000',ip,phone) from fixture;
select pg_temp.ok('server gateway returns private token',(select response->>'management_token' ~ '^[a-f0-9]{64}$' from results));
select pg_temp.ok('conflict remains controlled',(select public.book_public_appointment_guarded('audit-'||loc,svc,
 ((current_date+40)+time '09:00') at time zone 'America/Sao_Paulo','Other customer','11955550001',ip,phone)->>'error_code'='23P01' from fixture));
reset role;
select pg_temp.ok('one booking and one customer after conflict',
 (select count(*)=1 from public.calendar_events where organization_id=(select org from fixture)) and
 (select count(*)=1 from public.customers where organization_id=(select org from fixture)));
select pg_temp.ok('failed bookings consume quota',(select hits=2 from public.booking_rate_limits where bucket='ip-minute:'||(select ip from fixture)));
-- Saturate the same minute bucket; next call cannot create another event.
update public.booking_rate_limits set hits=10 where bucket='ip-minute:'||(select ip from fixture);
set local role service_role;
select pg_temp.ok('minute quota blocks booking',(select public.book_public_appointment_guarded('audit-'||loc,svc,
 ((current_date+40)+time '10:00') at time zone 'America/Sao_Paulo','Customer','11955550002',ip,phone)->>'error_code'='RATE_LIMITED' from fixture));
reset role;
update public.booking_rate_limits set expires_at=now()-interval '1 second' where bucket='ip-minute:'||(select ip from fixture);
set local role service_role;
select pg_temp.ok('expired bucket permits next booking',(select public.book_public_appointment_guarded('audit-'||loc,svc,
 ((current_date+40)+time '10:00') at time zone 'America/Sao_Paulo','Customer','11955550002',ip,phone)->>'management_token' is not null from fixture));
reset role;
update public.booking_rate_limits set hits=100 where bucket='ip-day:'||(select ip from fixture);
set local role service_role;
select pg_temp.ok('daily quota blocks rotated phones',(select public.book_public_appointment_guarded('audit-'||loc,svc,
 ((current_date+40)+time '11:00') at time zone 'America/Sao_Paulo','Customer','11955550003',ip,repeat('d',64))->>'error_code'='RATE_LIMITED' from fixture));
reset role;
update public.booking_rate_limits set hits=10 where bucket='phone-hour:'||(select phone from fixture);
set local role service_role;
select pg_temp.ok('phone quota blocks rotated IPs',(select public.book_public_appointment_guarded('audit-'||loc,svc,
 ((current_date+40)+time '11:00') at time zone 'America/Sao_Paulo','Customer','11955550002',repeat('b',64),phone)->>'error_code'='RATE_LIMITED' from fixture));
select pg_temp.ok('missing digest fails closed',(select public.book_public_appointment_guarded('audit-'||loc,svc,now(),'Customer','11955550002',null,phone)->>'error_code'='22023' from fixture));
reset role;
-- Probe permissions under the actual API roles (not table-owner RLS bypass).
do $$ declare r text; f text; denied boolean; begin
 foreach r in array array['anon','authenticated'] loop
   execute format('set local role %I',r);
   foreach f in array array[
    'public.book_public_appointment_guarded(null,null,null,null,null,null,null)',
    'public.book_public_appointment_with_management(null,null,null,null,null)',
    'public.book_public_appointment(null,null,null,null,null)',
    'public.consume_booking_quota(''forged'',60,1000)'
   ] loop
     denied:=false;
     begin execute 'select '||f; exception when insufficient_privilege then denied:=true; end;
     perform pg_temp.ok(r||' cannot bypass through '||split_part(f,'(',1),denied);
   end loop;
   denied:=false;
   begin perform * from public.booking_rate_limits; exception when insufficient_privilege then denied:=true; end;
   perform pg_temp.ok(r||' cannot read quota metadata',denied);
   execute 'reset role';
 end loop;
end $$;
select jsonb_build_object('suite','security_phase5','passed',count(*),'tests',jsonb_agg(test order by test)) from security_results;
rollback;
