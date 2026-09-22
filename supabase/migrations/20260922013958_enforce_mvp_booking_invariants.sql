begin;

alter table public.calendar_events
  drop constraint if exists calendar_events_booking_snapshot_check;
alter table public.calendar_events
  add constraint calendar_events_booking_snapshot_check check (
    event_type <> 'booking'
    or (
      service_name is not null
      and service_duration_minutes between 1 and 1440
      and service_price_cents >= 0
      and customer_name is not null
      and customer_phone is not null
      and ends_at = starts_at + make_interval(mins => service_duration_minutes)
    )
  );

-- Customer creation and the whole recurring series now share one database
-- transaction. A rejected occurrence cannot leave a partial fixed customer.
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
  if char_length(normalized_name) not between 2 and 100
    or normalized_phone !~ '^[0-9]{8,15}$'
    or p_frequency not in ('weekly', 'biweekly', 'monthly')
    or p_starts_on < (now() at time zone target_location.time_zone)::date
    or (p_ends_on is not null and p_ends_on < p_starts_on)
    or (p_max_occurrences is not null and p_max_occurrences not between 1 and 240) then
    raise exception 'Dados da recorrência inválidos' using errcode = '22023';
  end if;

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

revoke all on function public.create_customer_and_recurring_booking(uuid, uuid, text, text, uuid, text, date, time, date, integer) from public;
grant execute on function public.create_customer_and_recurring_booking(uuid, uuid, text, text, uuid, text, date, time, date, integer) to authenticated;

commit;
