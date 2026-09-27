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

select pg_temp.ok('organization creation audited',exists(select 1 from public.audit_logs where organization_id=(select org from fixture) and entity_type='organizations' and action='entity.insert'));
do $$ declare denied boolean:=false; begin
 begin update public.services set name=repeat('x',121) where id=(select svc from fixture); exception when check_violation then denied:=true; end;
 perform pg_temp.ok('oversized service rejected by database',denied);
 denied:=false;
 begin update public.organizations set name=repeat('x',121) where id=(select org from fixture); exception when check_violation then denied:=true; end;
 perform pg_temp.ok('oversized organization rejected by database',denied);
 denied:=false;
 begin insert into public.customers(organization_id,name,phone) select org,repeat('x',101),'11955559999' from fixture; exception when check_violation then denied:=true; end;
 perform pg_temp.ok('oversized customer rejected by database',denied);
 denied:=false;
 begin insert into public.availability_blocks(organization_id,location_id,professional_id,title,start_date,end_date,is_all_day)
 select org,loc,pro,repeat('x',121),current_date+40,current_date+40,true from fixture; exception when check_violation then denied:=true; end;
 perform pg_temp.ok('oversized block title rejected by database',denied);
end $$;
select pg_temp.ok('services and both hour types audited',(select count(distinct entity_type)=3 from public.audit_logs where organization_id=(select org from fixture) and entity_type in ('services','location_hours','professional_hours')));
select set_config('request.jwt.claim.sub',(select usr::text from fixture),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
update public.services set price_cents=2000 where id=(select svc from fixture);
select pg_temp.ok('authorized direct edit records actor and minimal difference',exists(
 select 1 from public.audit_logs where organization_id=(select org from fixture) and entity_type='services'
 and action='entity.update' and actor_user_id=(select usr from fixture)
 and before_data->'fields'->>'price_cents'='1000' and after_data->'fields'->>'price_cents'='2000'));
update public.organization_memberships set is_active=false where organization_id=(select org from fixture) and user_id=(select usr from fixture);
reset role;
select pg_temp.ok('membership revocation audited',exists(select 1 from public.audit_logs where organization_id=(select org from fixture) and entity_type='organization_memberships' and action='entity.update' and actor_user_id=(select usr from fixture) and after_data->'fields'->>'is_active'='false'));
set local role authenticated;
select pg_temp.ok('removed member cannot read audit history',(select count(*)=0 from public.audit_logs where organization_id=(select org from fixture)));
do $$ declare denied boolean:=false; begin
 begin delete from public.audit_logs where organization_id=(select org from fixture); exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.ok('audit rows cannot be deleted through authenticated API',denied);
end $$;
reset role;
update public.organization_memberships set is_active=true where organization_id=(select org from fixture);
create temporary table managed_booking as select b.* from fixture f cross join lateral public.book_public_appointment_with_management(
 'audit-'||f.loc,f.svc,((current_date+40)+time '09:00') at time zone 'America/Sao_Paulo','PRIVATE CUSTOMER','11955550000') b;
grant select on managed_booking to anon,authenticated;
select pg_temp.ok('booking creation audited',exists(select 1 from public.audit_logs where entity_id=(select event_id from managed_booking) and action='entity.insert'));
select pg_temp.ok('audit excludes personal values and token hashes',not exists(
 select 1 from public.audit_logs where organization_id=(select org from fixture)
 and (coalesce(before_data::text,'')||coalesce(after_data::text,'')) ~ 'PRIVATE CUSTOMER|11955550000|customer_management_token_hash|management_token|email'));
set local role anon;
select pg_temp.ok('future booking token readable',(select count(*)=1 from public.get_public_booking_management('audit-'||(select loc from fixture),(select management_token from managed_booking))));
reset role;
update public.calendar_events set starts_at=now()-interval '32 days 30 minutes',ends_at=now()-interval '32 days' where id=(select event_id from managed_booking);
set local role anon;
select pg_temp.ok('historical token expires after 30 days',(select count(*)=0 from public.get_public_booking_management('audit-'||(select loc from fixture),(select management_token from managed_booking))));
reset role;
update public.calendar_events set starts_at=now()+interval '40 days',ends_at=now()+interval '40 days 30 minutes',status='cancelled',cancelled_at=now()-interval '31 days' where id=(select event_id from managed_booking);
set local role anon;
select pg_temp.ok('cancelled future booking token expires relative to cancellation',(select count(*)=0 from public.get_public_booking_management('audit-'||(select loc from fixture),(select management_token from managed_booking))));
reset role;
set local role authenticated;
select pg_temp.ok('professional still retains booking history',(select count(*)=1 from public.calendar_events where id=(select event_id from managed_booking)));
reset role;
-- Confirm deleting ONLY this random fixture parent still cascades without an audit FK failure.
delete from public.calendar_events where organization_id=(select org from fixture);
delete from public.organizations where id=(select org from fixture);
select pg_temp.ok('tenant cascade does not leave orphan audit rows',(select count(*)=0 from public.audit_logs where organization_id=(select org from fixture)));
select jsonb_build_object('suite','security_phase6','passed',count(*),'tests',jsonb_agg(test order by test)) from security_results;
rollback;
