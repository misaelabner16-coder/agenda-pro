begin;

-- Public schedule only: candidate times and availability, never customer data,
-- event IDs, management tokens, or the contents of a block.
create function public.get_public_slot_states(p_slug text, p_service_id uuid, p_date date)
returns table(starts_at timestamptz, status text)
language plpgsql security definer set search_path = '' as $$
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
  join public.professional_services ps on ps.organization_id = lp.organization_id
    and ps.professional_id = lp.professional_id and ps.service_id = target_service.id and ps.is_active
  join public.professionals p on p.id = lp.professional_id and p.organization_id = lp.organization_id and p.is_active
  where lp.location_id = target_location.id and lp.organization_id = target_location.organization_id
    and lp.professional_id = target_location.default_professional_id and lp.is_active;
  if not found then raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002'; end if;

  return query
  with working_windows as (
    select greatest(lh.start_time, ph.start_time) as start_time, least(lh.end_time, ph.end_time) as end_time
    from public.location_hours lh
    join public.professional_hours ph on ph.organization_id = lh.organization_id
      and ph.location_id = lh.location_id and ph.professional_id = target_professional_id and ph.week_day = lh.week_day
    where lh.organization_id = target_location.organization_id and lh.location_id = target_location.id
      and lh.week_day = extract(dow from p_date)
  ), candidates as (
    select distinct generated.slot_start, generated.slot_start + make_interval(mins => target_service.duration_minutes) as slot_end
    from working_windows w
    cross join lateral generate_series(
      ((p_date + w.start_time) at time zone target_location.time_zone),
      ((p_date + w.end_time - make_interval(mins => target_service.duration_minutes)) at time zone target_location.time_zone),
      interval '15 minutes'
    ) as generated(slot_start)
    where w.end_time > w.start_time and generated.slot_start >= now()
  ), available as materialized (
    -- Reuse the authoritative booking rules so the display cannot turn a
    -- blocked slot into a selectable slot when availability rules change.
    select s.starts_at from public.get_available_slots(p_slug, p_service_id, p_date) s
  )
  select c.slot_start,
    case
      when a.starts_at is not null then 'available'
      when exists (
        select 1 from public.calendar_events e
        where e.professional_id = target_professional_id and e.status = 'confirmed' and e.event_type = 'booking'
          and tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
      ) then 'occupied'
      else 'blocked'
    end::text
  from candidates c left join available a on a.starts_at = c.slot_start
  order by c.slot_start;
end;
$$;
revoke all on function public.get_public_slot_states(text, uuid, date) from public, anon, authenticated;
grant execute on function public.get_public_slot_states(text, uuid, date) to anon, authenticated;

commit;
