begin;

-- These helpers are referenced by RLS policies. Removing EXECUTE from the
-- authenticated role made every policy that calls them fail with 42501.
-- They only answer questions about auth.uid(); callers cannot supply a user.
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, public.organization_role[]) to authenticated;
grant execute on function public.can_access_schedule(uuid, uuid) to authenticated;

-- The MVP supports one active workspace per account. Serialize onboarding by
-- user and return the existing workspace when a form is retried/double-clicked.
create or replace function public.create_organization_with_location(
  p_name text,
  p_public_slug text,
  p_time_zone text default 'America/Sao_Paulo'
)
returns table(organization_id uuid, location_id uuid, professional_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller_id uuid := auth.uid();
  normalized_name text := trim(p_name);
  normalized_slug text := lower(trim(p_public_slug));
  normalized_time_zone text := coalesce(nullif(trim(p_time_zone), ''), 'America/Sao_Paulo');
  existing_organization_id uuid;
  existing_location_id uuid;
  existing_professional_id uuid;
  new_organization_id uuid := gen_random_uuid();
  new_location_id uuid := gen_random_uuid();
  new_professional_id uuid := gen_random_uuid();
  professional_name text;
begin
  if caller_id is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(caller_id::text));

  select m.organization_id, l.id, l.default_professional_id
    into existing_organization_id, existing_location_id, existing_professional_id
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.is_active
  join public.locations l on l.organization_id = o.id and l.is_active
  where m.user_id = caller_id and m.is_active
  order by m.created_at, l.created_at
  limit 1;

  if found then
    return query select existing_organization_id, existing_location_id, existing_professional_id;
    return;
  end if;

  if char_length(normalized_name) < 2
    or char_length(normalized_name) > 120
    or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(normalized_slug) > 80 then
    raise exception 'Dados da organização inválidos' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = normalized_time_zone) then
    raise exception 'Fuso horário inválido' using errcode = '22023';
  end if;

  select coalesce(nullif(trim(full_name), ''), normalized_name)
    into professional_name
  from public.profiles
  where id = caller_id;

  insert into public.organizations (id, name, slug)
  values (new_organization_id, normalized_name, normalized_slug);
  insert into public.organization_memberships (organization_id, user_id, role)
  values (new_organization_id, caller_id, 'owner');
  insert into public.locations (id, organization_id, name, public_slug, time_zone)
  values (new_location_id, new_organization_id, normalized_name, normalized_slug, normalized_time_zone);
  insert into public.professionals (id, organization_id, user_id, display_name)
  values (new_professional_id, new_organization_id, caller_id, coalesce(professional_name, normalized_name));
  insert into public.location_professionals (organization_id, location_id, professional_id)
  values (new_organization_id, new_location_id, new_professional_id);
  update public.locations
  set default_professional_id = new_professional_id
  where id = new_location_id;

  return query select new_organization_id, new_location_id, new_professional_id;
end;
$$;

-- A professional is the reservable resource. They cannot be in two units at
-- the same instant. Different professionals remain free to work concurrently.
alter table public.calendar_events
  drop constraint if exists calendar_events_no_professional_overlaps;
alter table public.calendar_events
  add constraint calendar_events_no_professional_overlaps
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

-- The organization/location/professional relationships are also enforced by
-- the database, not just by forms and RPCs.
alter table public.calendar_events
  drop constraint if exists calendar_events_location_professional_fkey;
alter table public.calendar_events
  add constraint calendar_events_location_professional_fkey
  foreign key (location_id, professional_id)
  references public.location_professionals(location_id, professional_id);

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
  from public.locations l
  join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug))
    and l.is_active
    and o.is_active;
  if not found then
    raise exception 'Estabelecimento não encontrado' using errcode = 'P0002';
  end if;

  select * into target_service
  from public.services
  where id = p_service_id
    and organization_id = target_location.organization_id
    and is_active;
  if not found then
    raise exception 'Serviço não encontrado' using errcode = 'P0002';
  end if;

  select lp.professional_id into target_professional_id
  from public.location_professionals lp
  join public.professional_services ps
    on ps.organization_id = lp.organization_id
   and ps.professional_id = lp.professional_id
   and ps.service_id = target_service.id
   and ps.is_active
  join public.professionals p
    on p.id = lp.professional_id
   and p.organization_id = lp.organization_id
   and p.is_active
  where lp.location_id = target_location.id
    and lp.organization_id = target_location.organization_id
    and lp.professional_id = target_location.default_professional_id
    and lp.is_active;
  if not found then
    raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002';
  end if;

  return query
  with working_windows as (
    select greatest(lh.start_time, ph.start_time) as start_time,
           least(lh.end_time, ph.end_time) as end_time
    from public.location_hours lh
    join public.professional_hours ph
      on ph.organization_id = lh.organization_id
     and ph.location_id = lh.location_id
     and ph.professional_id = target_professional_id
     and ph.week_day = lh.week_day
    where lh.organization_id = target_location.organization_id
      and lh.location_id = target_location.id
      and lh.week_day = extract(dow from p_date)
  ), candidates as (
    select generated.slot_start,
           generated.slot_start + make_interval(mins => target_service.duration_minutes) as slot_end
    from working_windows w
    cross join lateral generate_series(
      ((p_date + w.start_time) at time zone target_location.time_zone),
      ((p_date + w.end_time - make_interval(mins => target_service.duration_minutes)) at time zone target_location.time_zone),
      interval '15 minutes'
    ) as generated(slot_start)
    where w.end_time > w.start_time
  )
  select distinct c.slot_start, c.slot_end
  from candidates c
  where c.slot_start >= now()
    and not exists (
      select 1
      from public.calendar_events e
      where e.professional_id = target_professional_id
        and e.status = 'confirmed'
        and tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
  order by c.slot_start;
end;
$$;

create or replace function public.book_public_appointment(
  p_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  target_service public.services%rowtype;
  target_professional_id uuid;
  normalized_name text := trim(p_customer_name);
  normalized_phone text := regexp_replace(p_customer_phone, '\D', '', 'g');
  target_customer_id uuid;
  new_event_id uuid;
  valid_slot boolean;
begin
  if char_length(normalized_name) not between 2 and 100
    or normalized_phone !~ '^[0-9]{8,15}$' then
    raise exception 'Dados do cliente inválidos' using errcode = '22023';
  end if;

  select l.* into target_location
  from public.locations l
  join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug))
    and l.is_active
    and o.is_active;
  if not found then
    raise exception 'Estabelecimento não encontrado' using errcode = 'P0002';
  end if;

  select * into target_service
  from public.services
  where id = p_service_id
    and organization_id = target_location.organization_id
    and is_active;
  if not found then
    raise exception 'Serviço não encontrado' using errcode = 'P0002';
  end if;

  select lp.professional_id into target_professional_id
  from public.location_professionals lp
  join public.professional_services ps
    on ps.organization_id = lp.organization_id
   and ps.professional_id = lp.professional_id
   and ps.service_id = target_service.id
   and ps.is_active
  join public.professionals p
    on p.id = lp.professional_id
   and p.organization_id = lp.organization_id
   and p.is_active
  where lp.location_id = target_location.id
    and lp.organization_id = target_location.organization_id
    and lp.professional_id = target_location.default_professional_id
    and lp.is_active;
  if not found then
    raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.get_available_slots(
      p_slug,
      p_service_id,
      (p_starts_at at time zone target_location.time_zone)::date
    ) s
    where s.starts_at = p_starts_at
  ) into valid_slot;
  if not valid_slot then
    raise exception 'Horário indisponível' using errcode = '23P01';
  end if;

  insert into public.customers (organization_id, name, phone)
  values (target_location.organization_id, normalized_name, normalized_phone)
  on conflict on constraint customers_organization_phone_key
  do update set name = excluded.name
  returning id into target_customer_id;

  insert into public.calendar_events (
    organization_id, location_id, professional_id, event_type, status,
    starts_at, ends_at, service_id, service_name,
    service_duration_minutes, service_price_cents,
    customer_id, customer_name, customer_phone
  ) values (
    target_location.organization_id, target_location.id, target_professional_id,
    'booking', 'confirmed', p_starts_at,
    p_starts_at + make_interval(mins => target_service.duration_minutes),
    target_service.id, target_service.name, target_service.duration_minutes,
    target_service.price_cents, target_customer_id, normalized_name, normalized_phone
  )
  returning id into new_event_id;

  return new_event_id;
exception when exclusion_violation then
  raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

revoke all on function public.create_organization_with_location(text, text, text) from public;
revoke all on function public.get_available_slots(text, uuid, date) from public;
revoke all on function public.book_public_appointment(text, uuid, timestamptz, text, text) from public;
grant execute on function public.create_organization_with_location(text, text, text) to authenticated;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.book_public_appointment(text, uuid, timestamptz, text, text) to anon, authenticated;

commit;
