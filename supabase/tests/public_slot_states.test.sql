begin;
set local lock_timeout = '2s';

do $$
declare
  org uuid := gen_random_uuid();
  loc uuid := gen_random_uuid();
  prof uuid := gen_random_uuid();
  svc uuid := gen_random_uuid();
  booking uuid := gen_random_uuid();
  customer uuid := gen_random_uuid();
  slug text := 'slot-state-' || org::text;
  test_day date := date '2030-01-07';
  actual_count integer;
begin
  insert into public.organizations (id, name, slug) values (org, 'Slot states fixture', slug);
  insert into public.professionals (id, organization_id, display_name) values (prof, org, 'Test professional');
  insert into public.locations (id, organization_id, name, public_slug, time_zone, default_professional_id)
    values (loc, org, 'Test location', slug, 'America/Sao_Paulo', prof);
  insert into public.location_professionals (organization_id, location_id, professional_id) values (org, loc, prof);
  insert into public.services (id, organization_id, name, duration_minutes, price_cents) values (svc, org, 'Test service', 60, 5000);
  insert into public.professional_services (organization_id, professional_id, service_id) values (org, prof, svc);
  insert into public.location_hours (organization_id, location_id, week_day, start_time, end_time)
    values (org, loc, extract(dow from test_day), '09:00', '12:00');
  insert into public.professional_hours (organization_id, location_id, professional_id, week_day, start_time, end_time)
    values (org, loc, prof, extract(dow from test_day), '09:00', '12:00');

  select count(*) into actual_count from public.get_public_slot_states(slug, svc, test_day) where status = 'available';
  if actual_count <> 9 then raise exception 'Expected nine full-service candidates'; end if;

  insert into public.customers (id, organization_id, name, phone) values (customer, org, 'Never public', '11900000000');
  insert into public.calendar_events (id, organization_id, location_id, professional_id, event_type, starts_at, ends_at,
    service_id, service_name, service_duration_minutes, service_price_cents, customer_id, customer_name, customer_phone)
  values (booking, org, loc, prof, 'booking', '2030-01-07 10:00 America/Sao_Paulo', '2030-01-07 11:00 America/Sao_Paulo',
    svc, 'Test service', 60, 5000, customer, 'Never public', '11900000000');

  select count(*) into actual_count from public.get_public_slot_states(slug, svc, test_day) where status = 'occupied';
  if actual_count <> 7 then raise exception 'Every overlapping start must remain visible as occupied'; end if;
  if not exists (select 1 from public.get_public_slot_states(slug, svc, test_day)
    where starts_at = '2030-01-07 11:00 America/Sao_Paulo' and status = 'available')
    then raise exception 'Adjacent appointment must not count as overlap'; end if;

  insert into public.availability_blocks (organization_id, location_id, professional_id, title, start_date, end_date, start_time, end_time, is_all_day)
    values (org, loc, prof, 'Private block', test_day, test_day, '11:30', '12:00', false);
  if not exists (select 1 from public.get_public_slot_states(slug, svc, test_day)
    where starts_at = '2030-01-07 11:00 America/Sao_Paulo' and status = 'blocked')
    then raise exception 'A service crossing a block must be disabled'; end if;

  if exists (
    (select starts_at from public.get_public_slot_states(slug, svc, test_day) where status = 'available'
      except select starts_at from public.get_available_slots(slug, svc, test_day))
    union all
    (select starts_at from public.get_available_slots(slug, svc, test_day)
      except select starts_at from public.get_public_slot_states(slug, svc, test_day) where status = 'available')
  ) then raise exception 'Public availability must equal authoritative booking availability'; end if;

  update public.calendar_events set status = 'cancelled' where id = booking;
  if exists (select 1 from public.get_public_slot_states(slug, svc, test_day) where status = 'occupied')
    then raise exception 'Cancellation must release occupied starts'; end if;

  if exists (select 1 from public.get_public_slot_states(slug, svc, date '2020-01-01'))
    then raise exception 'Past starts must not appear'; end if;
  if not has_function_privilege('anon', 'public.get_public_slot_states(text,uuid,date)', 'EXECUTE')
    then raise exception 'Anonymous public schedule must be executable'; end if;
  if has_table_privilege('anon', 'public.calendar_events', 'SELECT')
    then raise exception 'Private appointment table must remain inaccessible'; end if;

  update public.organizations set is_active = false where id = org;
  begin
    perform public.get_public_slot_states(slug, svc, test_day);
    raise exception 'Suspended organization must not expose schedule';
  exception when sqlstate 'P0002' then null;
  end;
end;
$$;
select 10 as passed_checks, 'public_slot_states' as suite;
rollback;
