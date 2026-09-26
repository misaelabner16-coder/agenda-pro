begin;

-- Preserve historical data. Validation aborts this whole migration if existing
-- rows violate an invariant; never silently repair/delete someone else's data.
alter table public.calendar_events add constraint calendar_events_snapshot_required
  check (event_type <> 'booking' or (
    service_duration_minutes is not null and service_price_cents is not null
    and service_duration_minutes between 1 and 1440 and service_price_cents >= 0
    and ends_at = starts_at + make_interval(mins => service_duration_minutes)
  )) not valid;
alter table public.calendar_events validate constraint calendar_events_snapshot_required;
alter table public.calendar_events add constraint calendar_events_series_tenant_fkey
  foreign key (organization_id, series_id) references public.appointment_series(organization_id, id) not valid;
alter table public.calendar_events validate constraint calendar_events_series_tenant_fkey;

-- One availability calculation, with the original duration/professional for a
-- reschedule. The optional ignored event is supplied ONLY by trusted functions.
create function public.available_slots_for_booking(
  p_location_id uuid, p_professional_id uuid, p_service_id uuid, p_date date,
  p_duration integer, p_ignore_event_id uuid default null
)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target_location public.locations%rowtype; duration integer;
begin
  if p_date is null or not isfinite(p_date) then
    raise exception 'Data inválida' using errcode='22023';
  end if;
  select l.* into target_location from public.locations l
    join public.organizations o on o.id=l.organization_id and o.is_active
    where l.id=p_location_id and l.is_active;
  if not found then raise exception 'Unidade indisponível' using errcode='P0002'; end if;
  select coalesce(p_duration,s.duration_minutes) into duration from public.services s
    where s.id=p_service_id and s.organization_id=target_location.organization_id and s.is_active;
  if not found then raise exception 'Serviço indisponível' using errcode='P0002'; end if;
  if duration not between 1 and 1440 then raise exception 'Duração inválida' using errcode='22023'; end if;
  if not exists (
    select 1 from public.location_professionals lp
    join public.professionals p on p.id=lp.professional_id and p.organization_id=lp.organization_id and p.is_active
    join public.professional_services ps on ps.organization_id=lp.organization_id and ps.professional_id=p.id
      and ps.service_id=p_service_id and ps.is_active
    where lp.organization_id=target_location.organization_id and lp.location_id=p_location_id
      and lp.professional_id=p_professional_id and lp.is_active
  ) then raise exception 'Profissional indisponível' using errcode='P0002'; end if;
  return query
  with windows as (
    select greatest(lh.start_time,ph.start_time) as start_time, least(lh.end_time,ph.end_time) as end_time
    from public.location_hours lh join public.professional_hours ph
      on ph.organization_id=lh.organization_id and ph.location_id=lh.location_id
      and ph.professional_id=p_professional_id and ph.week_day=lh.week_day
    where lh.location_id=p_location_id and lh.organization_id=target_location.organization_id
      and lh.week_day=extract(dow from p_date)
  ), candidates as (
    select slot_start, slot_start+make_interval(mins=>duration) as slot_end
    from windows w cross join lateral generate_series(
      (p_date+w.start_time) at time zone target_location.time_zone,
      ((p_date+w.end_time) at time zone target_location.time_zone) - make_interval(mins=>duration),
      interval '15 minutes') g(slot_start)
    where w.end_time>w.start_time
  )
  select distinct c.slot_start,c.slot_end from candidates c
  where c.slot_start>=now() and not exists (
    select 1 from public.calendar_events e where e.professional_id=p_professional_id and e.status='confirmed'
      and (p_ignore_event_id is null or e.id<>p_ignore_event_id)
      and tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(c.slot_start,c.slot_end,'[)')
  ) and not exists (
    select 1 from public.availability_blocks b where b.organization_id=target_location.organization_id
      and b.location_id=p_location_id and b.professional_id=p_professional_id
      and ((b.week_days is null and p_date between b.start_date and b.end_date)
        or (b.week_days is not null and extract(dow from p_date)::smallint=any(b.week_days)))
      and (b.is_all_day or tstzrange(c.slot_start,c.slot_end,'[)') && tstzrange(
        (p_date+b.start_time) at time zone target_location.time_zone,
        (p_date+b.end_time) at time zone target_location.time_zone,'[)'))
  ) order by c.slot_start;
end;
$$;
revoke all on function public.available_slots_for_booking(uuid,uuid,uuid,date,integer,uuid) from public,anon,authenticated;

create or replace function public.get_available_slots(p_slug text,p_service_id uuid,p_date date)
returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target_location public.locations%rowtype;
begin
  select * into target_location from public.locations where lower(public_slug)=lower(btrim(p_slug));
  if not found then raise exception 'Estabelecimento não encontrado' using errcode='P0002'; end if;
  return query select * from public.available_slots_for_booking(target_location.id,
    target_location.default_professional_id,p_service_id,p_date,null,null);
end;
$$;

create function public.get_public_reschedule_slots(p_slug text,p_management_token text,p_date date)
returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target_event public.calendar_events%rowtype; minimum_minutes integer;
begin
  select e.* into target_event
  from public.calendar_events e join public.locations l on l.id=e.location_id
  where lower(l.public_slug)=lower(btrim(p_slug)) and e.event_type='booking'
    and e.customer_management_token_hash=encode(extensions.digest(convert_to(p_management_token,'UTF8'),'sha256'),'hex');
  if not found or target_event.status<>'confirmed' then raise exception 'Agendamento indisponível' using errcode='P0002'; end if;
  select customer_cancel_minimum_minutes into minimum_minutes from public.locations where id=target_event.location_id;
  if target_event.starts_at<=now()+make_interval(mins=>minimum_minutes) then
    raise exception 'O prazo para reagendar já passou' using errcode='42501';
  end if;
  return query select * from public.available_slots_for_booking(target_event.location_id,
    target_event.professional_id,target_event.service_id,p_date,target_event.service_duration_minutes,target_event.id);
end;
$$;
revoke all on function public.get_public_reschedule_slots(text,text,date) from public,anon,authenticated;
grant execute on function public.get_public_reschedule_slots(text,text,date) to anon,authenticated;

create or replace function public.reschedule_public_booking(p_slug text,p_management_token text,p_new_starts_at timestamptz)
returns table(starts_at timestamptz,ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare target_event public.calendar_events%rowtype; target_location public.locations%rowtype; new_end timestamptz;
begin
  if p_new_starts_at is null or not isfinite(p_new_starts_at) then raise exception 'Data inválida' using errcode='22023'; end if;
  select e.* into target_event from public.calendar_events e join public.locations l on l.id=e.location_id
    where lower(l.public_slug)=lower(btrim(p_slug)) and e.event_type='booking'
      and e.customer_management_token_hash=encode(extensions.digest(convert_to(p_management_token,'UTF8'),'sha256'),'hex');
  if not found then raise exception 'Agendamento não encontrado' using errcode='P0002'; end if;
  -- All booking/cancellation/series operations acquire professional then row.
  perform pg_advisory_xact_lock(hashtext(target_event.professional_id::text));
  select * into target_event from public.calendar_events where id=target_event.id for update;
  select * into target_location from public.locations where id=target_event.location_id;
  if target_event.status<>'confirmed' then raise exception 'Agendamento indisponível' using errcode='P0002'; end if;
  if target_event.starts_at<=now()+make_interval(mins=>target_location.customer_cancel_minimum_minutes) then
    raise exception 'O prazo para reagendar já passou' using errcode='42501';
  end if;
  select s.ends_at into new_end from public.available_slots_for_booking(target_event.location_id,
    target_event.professional_id,target_event.service_id,(p_new_starts_at at time zone target_location.time_zone)::date,
    target_event.service_duration_minutes,target_event.id) s where s.starts_at=p_new_starts_at;
  if not found then raise exception 'Horário indisponível' using errcode='23P01'; end if;
  update public.calendar_events set starts_at=p_new_starts_at,ends_at=new_end where id=target_event.id;
  insert into public.audit_logs(organization_id,action,entity_type,entity_id,before_data,after_data)
    values(target_event.organization_id,'booking.rescheduled_by_customer','calendar_event',target_event.id,
      jsonb_build_object('starts_at',target_event.starts_at,'ends_at',target_event.ends_at),
      jsonb_build_object('starts_at',p_new_starts_at,'ends_at',new_end));
  return query select p_new_starts_at,new_end;
exception when exclusion_violation then raise exception 'Horário indisponível' using errcode='23P01';
end;
$$;

create or replace function public.cancel_public_booking(p_slug text,p_management_token text,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target_event public.calendar_events%rowtype; minimum_minutes integer;
begin
  if char_length(p_reason)>500 then raise exception 'Motivo muito longo' using errcode='22023'; end if;
  select e.* into target_event from public.calendar_events e join public.locations l on l.id=e.location_id
    join public.organizations o on o.id=e.organization_id and o.is_active
    where lower(l.public_slug)=lower(btrim(p_slug)) and e.event_type='booking'
      and e.customer_management_token_hash=encode(extensions.digest(convert_to(p_management_token,'UTF8'),'sha256'),'hex');
  if not found then raise exception 'Agendamento não encontrado' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtext(target_event.professional_id::text));
  select * into target_event from public.calendar_events where id=target_event.id for update;
  select customer_cancel_minimum_minutes into minimum_minutes from public.locations where id=target_event.location_id;
  if target_event.status<>'confirmed' then raise exception 'Agendamento já cancelado' using errcode='P0002'; end if;
  if target_event.starts_at<=now()+make_interval(mins=>minimum_minutes) then
    raise exception 'O prazo para cancelar já passou' using errcode='42501';
  end if;
  update public.calendar_events set status='cancelled',cancelled_at=now(),cancelled_by='customer',
    cancellation_reason=nullif(btrim(p_reason),'') where id=target_event.id;
  insert into public.audit_logs(organization_id,action,entity_type,entity_id,before_data,after_data)
    values(target_event.organization_id,'booking.cancelled_by_customer','calendar_event',target_event.id,
      jsonb_build_object('status','confirmed'),jsonb_build_object('status','cancelled'));
end;
$$;

create or replace function public.cancel_booking_as_staff(p_event_id uuid,p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare target_event public.calendar_events%rowtype;
begin
  if char_length(p_reason)>500 then raise exception 'Motivo muito longo' using errcode='22023'; end if;
  select * into target_event from public.calendar_events where id=p_event_id and event_type='booking';
  if not found then raise exception 'Agendamento não encontrado' using errcode='P0002'; end if;
  if not public.can_access_schedule(target_event.organization_id,target_event.professional_id) and not public.is_platform_admin()
    then raise exception 'Sem permissão' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(target_event.professional_id::text));
  select * into target_event from public.calendar_events where id=p_event_id for update;
  if not public.can_access_schedule(target_event.organization_id,target_event.professional_id) and not public.is_platform_admin()
    then raise exception 'Sem permissão' using errcode='42501'; end if;
  if target_event.status<>'confirmed' then raise exception 'Agendamento já cancelado' using errcode='P0002'; end if;
  update public.calendar_events set status='cancelled',cancelled_at=now(),cancelled_by='staff',
    cancellation_reason=nullif(btrim(p_reason),'') where id=p_event_id;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(target_event.organization_id,auth.uid(),'booking.cancelled_by_staff','calendar_event',p_event_id,
      jsonb_build_object('status','confirmed'),jsonb_build_object('status','cancelled'));
end;
$$;

create or replace function public.cancel_appointment_series(p_series_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_series public.appointment_series%rowtype;
begin
  select * into target_series from public.appointment_series where id=p_series_id;
  if not found then raise exception 'Série não encontrada' using errcode='P0002'; end if;
  if not public.can_access_schedule(target_series.organization_id,target_series.professional_id) and not public.is_platform_admin()
    then raise exception 'Sem permissão' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(target_series.professional_id::text));
  select * into target_series from public.appointment_series where id=p_series_id for update;
  if not public.can_access_schedule(target_series.organization_id,target_series.professional_id) and not public.is_platform_admin()
    then raise exception 'Sem permissão' using errcode='42501'; end if;
  if not target_series.is_active then return; end if;
  update public.appointment_series set is_active=false where id=p_series_id;
  update public.calendar_events set status='cancelled',cancelled_at=now(),cancelled_by='staff',cancellation_reason='Série cancelada'
    where organization_id=target_series.organization_id and series_id=p_series_id and status='confirmed' and starts_at>now();
  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id)
    values(target_series.organization_id,auth.uid(),'booking.series_cancelled','appointment_series',p_series_id);
end;
$$;

-- Public callers supply snapshots, not authority to rename an existing CRM customer.
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
  if normalized_name is null or normalized_phone is null or p_starts_at is null or not isfinite(p_starts_at)
    or char_length(normalized_name) not between 2 and 100 or normalized_phone !~ '^[0-9]{8,15}$' then
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
  do nothing returning id into target_customer_id;
  if target_customer_id is null then
    select id into target_customer_id from public.customers
    where organization_id=target_location.organization_id and phone=normalized_phone;
  end if;
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

-- Serialize the complete series and validate every occurrence in the internal writer.
create or replace function public.create_recurring_booking(
  p_location_id uuid,
  p_professional_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_frequency text,
  p_starts_on date,
  p_start_time time,
  p_ends_on date default null,
  p_max_occurrences integer default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  target_service public.services%rowtype;
  new_series_id uuid := gen_random_uuid();
  occurrence_date date := p_starts_on;
  occurrence_number integer := 0;
  occurrence_limit integer := coalesce(p_max_occurrences, 24);
  desired_day integer := extract(day from p_starts_on);
  occurrence_start timestamptz;
  candidate_month date;
begin
  select * into target_location from public.locations where id = p_location_id and is_active;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0002'; end if;
  if not public.can_access_schedule(target_location.organization_id, p_professional_id) then
    raise exception 'Sem permissão para criar recorrência' using errcode = '42501'; end if;
  if p_frequency is null or p_starts_on is null or not isfinite(p_starts_on) or p_start_time is null
    or (p_ends_on is not null and not isfinite(p_ends_on)) or p_frequency not in ('weekly', 'biweekly', 'monthly') then raise exception 'Frequência inválida' using errcode = '22023'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'Data final inválida' using errcode = '22023'; end if;
  if p_max_occurrences is not null and p_max_occurrences not between 1 and 240 then raise exception 'Quantidade inválida' using errcode = '22023'; end if;
  select * into target_service from public.services
  where id = p_service_id and organization_id = target_location.organization_id and is_active;
  if not found then raise exception 'Serviço inválido' using errcode = '22023'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = target_location.organization_id) then
    raise exception 'Cliente inválido' using errcode = '22023'; end if;
  if not exists (select 1 from public.location_professionals lp where lp.location_id = p_location_id and lp.professional_id = p_professional_id and lp.is_active) then
    raise exception 'Profissional indisponível nesta unidade' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext(p_professional_id::text));
  insert into public.appointment_series (
    id, organization_id, location_id, professional_id, customer_id, service_id, frequency,
    starts_on, ends_on, max_occurrences, start_time, monthly_day, created_by_user_id
  ) values (
    new_series_id, target_location.organization_id, p_location_id, p_professional_id, p_customer_id, p_service_id, p_frequency,
    p_starts_on, p_ends_on, p_max_occurrences, p_start_time,
    case when p_frequency = 'monthly' then desired_day else null end, auth.uid()
  );

  while occurrence_number < occurrence_limit and (p_ends_on is null or occurrence_date <= p_ends_on) loop
    occurrence_start := make_timestamptz(
      extract(year from occurrence_date)::integer, extract(month from occurrence_date)::integer,
      extract(day from occurrence_date)::integer, extract(hour from p_start_time)::integer,
      extract(minute from p_start_time)::integer, 0, target_location.time_zone
    );
    if not exists (select 1 from public.available_slots_for_booking(
      p_location_id,p_professional_id,p_service_id,occurrence_date,target_service.duration_minutes,null
    ) s where s.starts_at=occurrence_start) then
      raise exception 'Ocorrência indisponível. Nenhuma recorrência foi criada.' using errcode='23P01';
    end if;
    insert into public.calendar_events (
      organization_id, location_id, professional_id, event_type, status, starts_at, ends_at,
      service_id, service_name, service_duration_minutes, service_price_cents,
      customer_id, customer_name, customer_phone, series_id, created_by_user_id
    )
    select target_location.organization_id, target_location.id, p_professional_id, 'booking', 'confirmed', occurrence_start,
      occurrence_start + make_interval(mins => target_service.duration_minutes), target_service.id,
      target_service.name, target_service.duration_minutes, target_service.price_cents,
      c.id, c.name, c.phone, new_series_id, auth.uid()
    from public.customers c where c.id = p_customer_id;
    occurrence_number := occurrence_number + 1;
    if p_frequency = 'weekly' then occurrence_date := occurrence_date + 7;
    elsif p_frequency = 'biweekly' then occurrence_date := occurrence_date + 14;
    else
      -- Monthly rule: months that do not contain the selected day are skipped.
      candidate_month := (date_trunc('month', occurrence_date)::date + interval '1 month')::date;
      loop
        if desired_day <= extract(day from (date_trunc('month', candidate_month) + interval '1 month - 1 day')) then
          occurrence_date := make_date(extract(year from candidate_month)::integer, extract(month from candidate_month)::integer, desired_day);
          exit;
        end if;
        candidate_month := (candidate_month + interval '1 month')::date;
      end loop;
    end if;
  end loop;
  update public.customers set is_fixed = true where id = p_customer_id;
  return new_series_id;
exception when exclusion_violation then
  raise exception 'Há conflito com outro agendamento. Nenhuma recorrência foi criada.' using errcode = '23P01';
end;
$$;

create or replace function public.create_customer_and_recurring_booking(
  p_location_id uuid,
  p_professional_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_service_id uuid,
  p_frequency text,
  p_starts_on date,
  p_start_time time,
  p_ends_on date default null,
  p_max_occurrences integer default null
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  normalized_name text := trim(p_customer_name);
  normalized_phone text := regexp_replace(p_customer_phone, '\D', '', 'g');
  target_customer_id uuid;
  occurrence_date date := p_starts_on;
  occurrence_number integer := 0;
  occurrence_limit integer := coalesce(p_max_occurrences, 24);
  desired_day integer := extract(day from p_starts_on);
  occurrence_start timestamptz;
  candidate_month date;
  new_series_id uuid;
begin
  select l.* into target_location
  from public.locations l
  join public.organizations o on o.id = l.organization_id and o.is_active
  where l.id = p_location_id and l.is_active;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0002'; end if;
  if not public.can_access_schedule(target_location.organization_id, p_professional_id)
    and not public.is_platform_admin() then
    raise exception 'Sem permissão para criar recorrência' using errcode = '42501';
  end if;
  if target_location.default_professional_id is distinct from p_professional_id then
    raise exception 'Profissional inválido para a agenda pública' using errcode = '22023';
  end if;
  if normalized_name is null or normalized_phone is null or p_frequency is null
    or p_starts_on is null or not isfinite(p_starts_on) or p_start_time is null
    or (p_ends_on is not null and not isfinite(p_ends_on))
    or char_length(normalized_name) not between 2 and 100
    or normalized_phone !~ '^[0-9]{8,15}$'
    or p_frequency not in ('weekly', 'biweekly', 'monthly')
    or p_starts_on < (now() at time zone target_location.time_zone)::date
    or (p_ends_on is not null and p_ends_on < p_starts_on)
    or (p_max_occurrences is not null and p_max_occurrences not between 1 and 240) then
    raise exception 'Dados da recorrência inválidos' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_professional_id::text));
  while occurrence_number < occurrence_limit and (p_ends_on is null or occurrence_date <= p_ends_on) loop
    occurrence_start := make_timestamptz(
      extract(year from occurrence_date)::integer,
      extract(month from occurrence_date)::integer,
      extract(day from occurrence_date)::integer,
      extract(hour from p_start_time)::integer,
      extract(minute from p_start_time)::integer,
      0,
      target_location.time_zone
    );
    if not exists (
      select 1 from public.get_available_slots(target_location.public_slug, p_service_id, occurrence_date) slots
      where slots.starts_at = occurrence_start
    ) then
      raise exception 'Uma ou mais ocorrências estão fora do expediente ou em horário ocupado' using errcode = '23P01';
    end if;
    occurrence_number := occurrence_number + 1;
    if p_frequency = 'weekly' then occurrence_date := occurrence_date + 7;
    elsif p_frequency = 'biweekly' then occurrence_date := occurrence_date + 14;
    else
      candidate_month := (date_trunc('month', occurrence_date)::date + interval '1 month')::date;
      loop
        if desired_day <= extract(day from (date_trunc('month', candidate_month) + interval '1 month - 1 day')) then
          occurrence_date := make_date(extract(year from candidate_month)::integer, extract(month from candidate_month)::integer, desired_day);
          exit;
        end if;
        candidate_month := (candidate_month + interval '1 month')::date;
      end loop;
    end if;
  end loop;

  insert into public.customers (organization_id, name, phone, is_fixed)
  values (target_location.organization_id, normalized_name, normalized_phone, true)
  on conflict on constraint customers_organization_phone_key
  do update set name = excluded.name, is_fixed = true
  returning id into target_customer_id;

  new_series_id := public.create_recurring_booking(
    p_location_id, p_professional_id, target_customer_id, p_service_id,
    p_frequency, p_starts_on, p_start_time, p_ends_on, p_max_occurrences
  );
  return new_series_id;
end;
$$;

commit;
