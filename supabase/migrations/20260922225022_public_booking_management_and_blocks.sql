begin;

-- Reusable availability rules: a dated interval, a weekly interval, or an
-- all-day date range. They stay separate from appointments so a block never
-- deletes or mutates historical bookings.
create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  title text not null default 'Horário bloqueado',
  start_date date,
  end_date date,
  week_days smallint[],
  start_time time,
  end_time time,
  is_all_day boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (week_days is null and start_date is not null and end_date is not null)
    or (week_days is not null and cardinality(week_days) > 0)
  ),
  check (end_date is null or start_date is null or end_date >= start_date),
  check (
    is_all_day and start_time is null and end_time is null
    or not is_all_day and start_time is not null and end_time is not null and end_time > start_time
  ),
  check (week_days is null or week_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  foreign key (organization_id, location_id) references public.locations(organization_id, id),
  foreign key (organization_id, professional_id) references public.professionals(organization_id, id),
  foreign key (location_id, professional_id) references public.location_professionals(location_id, professional_id)
);
create index availability_blocks_schedule_idx
  on public.availability_blocks (location_id, professional_id, start_date, end_date);
create trigger availability_blocks_set_updated_at before update on public.availability_blocks
  for each row execute function public.set_updated_at();

alter table public.availability_blocks enable row level security;
revoke all on table public.availability_blocks from anon, authenticated;
grant select, delete on table public.availability_blocks to authenticated;
create policy "schedule members manage availability blocks"
  on public.availability_blocks for all to authenticated
  using (public.can_access_schedule(organization_id, professional_id) or (select public.is_platform_admin()))
  with check (public.can_access_schedule(organization_id, professional_id) or (select public.is_platform_admin()));

create or replace function public.create_availability_block(
  p_location_id uuid,
  p_professional_id uuid,
  p_title text,
  p_start_date date default null,
  p_end_date date default null,
  p_week_days smallint[] default null,
  p_start_time time default null,
  p_end_time time default null,
  p_is_all_day boolean default false
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  new_block_id uuid;
  normalized_days smallint[] := case when p_week_days is null then null else (select array_agg(distinct day order by day) from unnest(p_week_days) as day) end;
begin
  select * into target_location from public.locations where id = p_location_id and is_active;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0002'; end if;
  if not public.can_access_schedule(target_location.organization_id, p_professional_id)
    and not public.is_platform_admin() then
    raise exception 'Sem permissão para bloquear este horário' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.location_professionals lp
    join public.professionals p on p.id = lp.professional_id and p.is_active
    where lp.location_id = p_location_id and lp.professional_id = p_professional_id and lp.is_active
  ) then raise exception 'Profissional não atende nesta unidade' using errcode = '22023'; end if;
  if (normalized_days is null and (p_start_date is null or p_end_date is null))
    or (normalized_days is not null and exists (select 1 from unnest(normalized_days) as day where day not between 0 and 6))
    or (not p_is_all_day and (p_start_time is null or p_end_time is null or p_end_time <= p_start_time)) then
    raise exception 'Período inválido' using errcode = '22023';
  end if;
  if p_is_all_day and (p_start_time is not null or p_end_time is not null) then
    raise exception 'Bloqueios de dia inteiro não devem ter horário' using errcode = '22023';
  end if;

  -- The same lock used by booking/rescheduling prevents a reservation being
  -- inserted between this conflict check and the block creation.
  perform pg_advisory_xact_lock(hashtext(p_professional_id::text));
  if exists (
    select 1
    from public.calendar_events e
    where e.organization_id = target_location.organization_id
      and e.location_id = p_location_id
      and e.professional_id = p_professional_id
      and e.event_type = 'booking'
      and e.status = 'confirmed'
      and e.ends_at > now()
      and (
        (normalized_days is not null and extract(dow from e.starts_at at time zone target_location.time_zone)::smallint = any(normalized_days))
        or (normalized_days is null and (e.starts_at at time zone target_location.time_zone)::date <= p_end_date and (e.ends_at at time zone target_location.time_zone)::date >= p_start_date)
      )
      and (
        p_is_all_day
        or tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(
          ((e.starts_at at time zone target_location.time_zone)::date + p_start_time) at time zone target_location.time_zone,
          ((e.starts_at at time zone target_location.time_zone)::date + p_end_time) at time zone target_location.time_zone,
          '[)'
        )
      )
  ) then
    raise exception 'O bloqueio conflita com um agendamento existente. Cancele ou reagende-o antes de bloquear.' using errcode = '23P01';
  end if;

  insert into public.availability_blocks (
    organization_id, location_id, professional_id, title, start_date, end_date,
    week_days, start_time, end_time, is_all_day, created_by_user_id
  ) values (
    target_location.organization_id, p_location_id, p_professional_id,
    coalesce(nullif(trim(p_title), ''), 'Horário bloqueado'), p_start_date, p_end_date,
    normalized_days, p_start_time, p_end_time, p_is_all_day, auth.uid()
  ) returning id into new_block_id;
  return new_block_id;
end;
$$;

create or replace function public.get_available_slots(
  p_slug text,
  p_service_id uuid,
  p_date date
)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  target_service public.services%rowtype;
  target_professional_id uuid;
begin
  select l.* into target_location
  from public.locations l join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug)) and l.is_active and o.is_active;
  if not found then raise exception 'Estabelecimento não encontrado' using errcode = 'P0002'; end if;

  select * into target_service from public.services
  where id = p_service_id and organization_id = target_location.organization_id and is_active;
  if not found then raise exception 'Serviço não encontrado' using errcode = 'P0002'; end if;

  select lp.professional_id into target_professional_id
  from public.location_professionals lp
  join public.professional_services ps on ps.organization_id = lp.organization_id and ps.professional_id = lp.professional_id and ps.service_id = target_service.id and ps.is_active
  join public.professionals p on p.id = lp.professional_id and p.organization_id = lp.organization_id and p.is_active
  where lp.location_id = target_location.id and lp.organization_id = target_location.organization_id
    and lp.professional_id = target_location.default_professional_id and lp.is_active;
  if not found then raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002'; end if;

  return query
  with working_windows as (
    select greatest(lh.start_time, ph.start_time) as start_time, least(lh.end_time, ph.end_time) as end_time
    from public.location_hours lh
    join public.professional_hours ph on ph.organization_id = lh.organization_id and ph.location_id = lh.location_id and ph.professional_id = target_professional_id and ph.week_day = lh.week_day
    where lh.organization_id = target_location.organization_id and lh.location_id = target_location.id and lh.week_day = extract(dow from p_date)
  ), candidates as (
    select generated.slot_start, generated.slot_start + make_interval(mins => target_service.duration_minutes) as slot_end
    from working_windows w
    cross join lateral generate_series(
      ((p_date + w.start_time) at time zone target_location.time_zone),
      ((p_date + w.end_time - make_interval(mins => target_service.duration_minutes)) at time zone target_location.time_zone),
      interval '15 minutes'
    ) as generated(slot_start)
    where w.end_time > w.start_time
  )
  select distinct c.slot_start, c.slot_end from candidates c
  where c.slot_start >= now()
    and not exists (
      select 1 from public.calendar_events e
      where e.professional_id = target_professional_id and e.status = 'confirmed'
        and tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
    and not exists (
      select 1 from public.availability_blocks b
      where b.organization_id = target_location.organization_id
        and b.location_id = target_location.id and b.professional_id = target_professional_id
        and (
          (b.week_days is null and p_date between b.start_date and b.end_date)
          or (b.week_days is not null and extract(dow from p_date)::smallint = any(b.week_days))
        )
        and (
          b.is_all_day
          or tstzrange(c.slot_start, c.slot_end, '[)') && tstzrange(
            ((p_date + b.start_time) at time zone target_location.time_zone),
            ((p_date + b.end_time) at time zone target_location.time_zone), '[)'
          )
        )
    )
  order by c.slot_start;
end;
$$;

-- Replacing the function is additive to existing appointments. The lock makes
-- availability validation and the exclusion constraint work together when a
-- block, booking, or reschedule reaches the database concurrently.
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
  normalized_phone text := regexp_replace(p_customer_phone, '\\D', '', 'g');
  target_customer_id uuid;
  new_event_id uuid;
begin
  if char_length(normalized_name) not between 2 and 100 or normalized_phone !~ '^[0-9]{8,15}$' then raise exception 'Dados do cliente inválidos' using errcode = '22023'; end if;
  select l.* into target_location from public.locations l join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug)) and l.is_active and o.is_active;
  if not found then raise exception 'Estabelecimento não encontrado' using errcode = 'P0002'; end if;
  select * into target_service from public.services where id = p_service_id and organization_id = target_location.organization_id and is_active;
  if not found then raise exception 'Serviço não encontrado' using errcode = 'P0002'; end if;
  select lp.professional_id into target_professional_id from public.location_professionals lp
  join public.professional_services ps on ps.organization_id = lp.organization_id and ps.professional_id = lp.professional_id and ps.service_id = target_service.id and ps.is_active
  join public.professionals p on p.id = lp.professional_id and p.organization_id = lp.organization_id and p.is_active
  where lp.location_id = target_location.id and lp.organization_id = target_location.organization_id and lp.professional_id = target_location.default_professional_id and lp.is_active;
  if not found then raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtext(target_professional_id::text));
  if not exists (select 1 from public.get_available_slots(p_slug, p_service_id, (p_starts_at at time zone target_location.time_zone)::date) s where s.starts_at = p_starts_at) then
    raise exception 'Horário indisponível' using errcode = '23P01';
  end if;
  insert into public.customers (organization_id, name, phone) values (target_location.organization_id, normalized_name, normalized_phone)
  on conflict on constraint customers_organization_phone_key do update set name = excluded.name returning id into target_customer_id;
  insert into public.calendar_events (organization_id, location_id, professional_id, event_type, status, starts_at, ends_at, service_id, service_name, service_duration_minutes, service_price_cents, customer_id, customer_name, customer_phone)
  values (target_location.organization_id, target_location.id, target_professional_id, 'booking', 'confirmed', p_starts_at, p_starts_at + make_interval(mins => target_service.duration_minutes), target_service.id, target_service.name, target_service.duration_minutes, target_service.price_cents, target_customer_id, normalized_name, normalized_phone)
  returning id into new_event_id;
  return new_event_id;
exception when exclusion_violation then raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

drop function if exists public.get_public_booking_management(text, text);
create function public.get_public_booking_management(p_slug text, p_management_token text)
returns table(
  event_id uuid, location_name text, time_zone text, service_id uuid, service_name text,
  customer_name text, starts_at timestamptz, ends_at timestamptz, status text,
  customer_cancel_minimum_minutes integer, can_cancel boolean, can_reschedule boolean
)
language sql security definer set search_path = public, pg_temp as $$
  select e.id, l.name, l.time_zone, e.service_id, e.service_name, e.customer_name, e.starts_at, e.ends_at, e.status,
    l.customer_cancel_minimum_minutes,
    e.status = 'confirmed' and e.starts_at > now() + make_interval(mins => l.customer_cancel_minimum_minutes),
    e.status = 'confirmed' and e.starts_at > now() + make_interval(mins => l.customer_cancel_minimum_minutes)
  from public.calendar_events e
  join public.locations l on l.id = e.location_id
  join public.organizations o on o.id = e.organization_id and o.is_active
  where lower(l.public_slug) = lower(trim(p_slug))
    and e.customer_management_token_hash = encode(extensions.digest(convert_to(p_management_token, 'UTF8'), 'sha256'), 'hex')
    and e.event_type = 'booking';
$$;

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
  select * into target_location from public.locations where id = target_event.location_id and is_active;
  if not found or target_event.status <> 'confirmed' then raise exception 'Agendamento não está disponível para alteração' using errcode = 'P0002'; end if;
  if target_event.starts_at <= now() + make_interval(mins => target_location.customer_cancel_minimum_minutes) then raise exception 'O prazo para reagendar este agendamento já passou' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext(target_event.professional_id::text));
  if not exists (
    select 1 from public.get_available_slots(p_slug, target_event.service_id, (p_new_starts_at at time zone target_location.time_zone)::date) s
    where s.starts_at = p_new_starts_at
  ) then raise exception 'Horário indisponível' using errcode = '23P01'; end if;
  previous_starts_at := target_event.starts_at;
  previous_ends_at := target_event.ends_at;
  update public.calendar_events set starts_at = p_new_starts_at,
    ends_at = p_new_starts_at + make_interval(mins => target_event.service_duration_minutes)
  where id = target_event.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, before_data, after_data)
  values (target_event.organization_id, 'booking.rescheduled_by_customer', 'calendar_event', target_event.id,
    jsonb_build_object('starts_at', previous_starts_at, 'ends_at', previous_ends_at),
    jsonb_build_object('starts_at', p_new_starts_at, 'ends_at', p_new_starts_at + make_interval(mins => target_event.service_duration_minutes)));
  return query select p_new_starts_at, p_new_starts_at + make_interval(mins => target_event.service_duration_minutes);
exception when exclusion_violation then raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

revoke all on function public.create_availability_block(uuid, uuid, text, date, date, smallint[], time, time, boolean) from public;
revoke all on function public.reschedule_public_booking(text, text, timestamptz) from public;
revoke all on function public.get_public_booking_management(text, text) from public;
revoke all on function public.get_available_slots(text, uuid, date) from public;
revoke all on function public.book_public_appointment(text, uuid, timestamptz, text, text) from public;
grant execute on function public.create_availability_block(uuid, uuid, text, date, date, smallint[], time, time, boolean) to authenticated;
grant execute on function public.reschedule_public_booking(text, text, timestamptz) to anon, authenticated;
grant execute on function public.get_public_booking_management(text, text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;

commit;
