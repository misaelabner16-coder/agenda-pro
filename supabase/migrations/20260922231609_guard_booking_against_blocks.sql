begin;

-- Keep the existing public booking contract; correct phone normalization for
-- callers that send a formatted number directly to the RPC.
create or replace function public.book_public_appointment(
  p_slug text, p_service_id uuid, p_starts_at timestamptz,
  p_customer_name text, p_customer_phone text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  target_service public.services%rowtype;
  target_professional_id uuid;
  normalized_name text := trim(p_customer_name);
  normalized_phone text := regexp_replace(p_customer_phone, '[^0-9]', '', 'g');
  target_customer_id uuid;
  new_event_id uuid;
begin
  if char_length(normalized_name) not between 2 and 100 or normalized_phone !~ '^[0-9]{8,15}$' then
    raise exception 'Dados do cliente inválidos' using errcode = '22023';
  end if;
  select l.* into target_location from public.locations l
  join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug)) and l.is_active and o.is_active;
  if not found then raise exception 'Estabelecimento não encontrado' using errcode = 'P0002'; end if;
  select * into target_service from public.services
  where id = p_service_id and organization_id = target_location.organization_id and is_active;
  if not found then raise exception 'Serviço não encontrado' using errcode = 'P0002'; end if;
  select lp.professional_id into target_professional_id
  from public.location_professionals lp
  join public.professional_services ps on ps.organization_id = lp.organization_id
    and ps.professional_id = lp.professional_id and ps.service_id = target_service.id and ps.is_active
  join public.professionals p on p.id = lp.professional_id
    and p.organization_id = lp.organization_id and p.is_active
  where lp.location_id = target_location.id
    and lp.organization_id = target_location.organization_id
    and lp.professional_id = target_location.default_professional_id and lp.is_active;
  if not found then raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext(target_professional_id::text));
  if not exists (
    select 1 from public.get_available_slots(
      p_slug, p_service_id, (p_starts_at at time zone target_location.time_zone)::date
    ) s where s.starts_at = p_starts_at
  ) then raise exception 'Horário indisponível' using errcode = '23P01'; end if;
  insert into public.customers (organization_id, name, phone)
  values (target_location.organization_id, normalized_name, normalized_phone)
  on conflict on constraint customers_organization_phone_key
  do update set name = excluded.name returning id into target_customer_id;
  insert into public.calendar_events (
    organization_id, location_id, professional_id, event_type, status,
    starts_at, ends_at, service_id, service_name, service_duration_minutes,
    service_price_cents, customer_id, customer_name, customer_phone
  ) values (
    target_location.organization_id, target_location.id, target_professional_id,
    'booking', 'confirmed', p_starts_at,
    p_starts_at + make_interval(mins => target_service.duration_minutes),
    target_service.id, target_service.name, target_service.duration_minutes,
    target_service.price_cents, target_customer_id, normalized_name, normalized_phone
  ) returning id into new_event_id;
  return new_event_id;
exception when exclusion_violation then
  raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

-- Revalidate against the current schedule while treating the customer's own
-- old slot as free. The temporary cancellation is transaction-local; any
-- failure rolls it back together with the attempted move.
create or replace function public.reschedule_public_booking(
  p_slug text, p_management_token text, p_new_starts_at timestamptz
)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_event public.calendar_events%rowtype;
  target_location public.locations%rowtype;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
begin
  select e.* into target_event from public.calendar_events e
  join public.locations l on l.id = e.location_id
  where lower(l.public_slug) = lower(trim(p_slug))
    and e.customer_management_token_hash = encode(extensions.digest(convert_to(p_management_token, 'UTF8'), 'sha256'), 'hex')
    and e.event_type = 'booking';
  if not found then raise exception 'Agendamento não encontrado' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext(target_event.professional_id::text));
  select * into target_event from public.calendar_events where id = target_event.id for update;
  select * into target_location from public.locations where id = target_event.location_id and is_active;
  if not found or target_event.status <> 'confirmed' then
    raise exception 'Agendamento não está disponível para alteração' using errcode = 'P0002';
  end if;
  if target_event.starts_at <= now() + make_interval(mins => target_location.customer_cancel_minimum_minutes) then
    raise exception 'O prazo para reagendar este agendamento já passou' using errcode = '42501';
  end if;
  previous_starts_at := target_event.starts_at;
  previous_ends_at := target_event.ends_at;
  update public.calendar_events set status = 'cancelled' where id = target_event.id;
  if not exists (
    select 1 from public.get_available_slots(
      p_slug, target_event.service_id, (p_new_starts_at at time zone target_location.time_zone)::date
    ) s where s.starts_at = p_new_starts_at
  ) then raise exception 'Horário indisponível' using errcode = '23P01'; end if;
  update public.calendar_events set starts_at = p_new_starts_at,
    ends_at = p_new_starts_at + make_interval(mins => target_event.service_duration_minutes),
    status = 'confirmed'
  where id = target_event.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, before_data, after_data)
  values (target_event.organization_id, 'booking.rescheduled_by_customer', 'calendar_event', target_event.id,
    jsonb_build_object('starts_at', previous_starts_at, 'ends_at', previous_ends_at),
    jsonb_build_object('starts_at', p_new_starts_at, 'ends_at', p_new_starts_at + make_interval(mins => target_event.service_duration_minutes)));
  return query select p_new_starts_at, p_new_starts_at + make_interval(mins => target_event.service_duration_minutes);
exception when exclusion_violation then
  raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

-- Every confirmed booking insert or time change checks blocks in the database.
-- This also covers recurring appointments and direct RLS-authorized writes.
create or replace function public.reject_booking_in_availability_block()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_time_zone text;
  local_start_date date;
  local_end_date date;
begin
  if new.event_type <> 'booking' or new.status <> 'confirmed' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.professional_id::text));
  select l.time_zone into target_time_zone from public.locations l
  where l.id = new.location_id and l.organization_id = new.organization_id;
  if not found then raise exception 'Unidade inválida' using errcode = '22023'; end if;
  local_start_date := (new.starts_at at time zone target_time_zone)::date;
  local_end_date := ((new.ends_at - interval '1 microsecond') at time zone target_time_zone)::date;

  if exists (
    select 1 from public.availability_blocks b
    cross join lateral generate_series(local_start_date, local_end_date, interval '1 day') day_cursor(day_value)
    where b.organization_id = new.organization_id
      and b.location_id = new.location_id
      and b.professional_id = new.professional_id
      and (
        (b.week_days is null and day_cursor.day_value::date between b.start_date and b.end_date)
        or (b.week_days is not null and extract(dow from day_cursor.day_value)::smallint = any(b.week_days))
      )
      and (
        b.is_all_day or tstzrange(new.starts_at, new.ends_at, '[)') && tstzrange(
          ((day_cursor.day_value::date + b.start_time) at time zone target_time_zone),
          ((day_cursor.day_value::date + b.end_time) at time zone target_time_zone), '[)'
        )
      )
  ) then raise exception 'Horário bloqueado' using errcode = '23P01'; end if;
  return new;
end;
$$;

create trigger calendar_events_reject_availability_block
  before insert or update of starts_at, ends_at, status, location_id, professional_id, event_type
  on public.calendar_events for each row
  execute function public.reject_booking_in_availability_block();

revoke all on function public.reject_booking_in_availability_block() from public, anon, authenticated;
revoke execute on function public.book_public_appointment(text, uuid, timestamptz, text, text)
  from public, anon, authenticated;

commit;
