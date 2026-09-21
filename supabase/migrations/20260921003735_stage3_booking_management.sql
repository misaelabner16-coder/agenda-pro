-- Agenda Pro Stage 3: private customer management links, cancellations,
-- recurring customers and a platform-administrator boundary.
-- This migration is additive: existing bookings and memberships are retained.

begin;

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists email text;
update public.profiles p set email = lower(u.email)
from auth.users u where u.id = p.id and p.email is null;
create unique index if not exists profiles_email_case_insensitive_key
  on public.profiles (lower(email)) where email is not null;

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), lower(new.email))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon, authenticated;
grant select on table public.platform_admins to authenticated;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

create policy "platform admin reads own role" on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

-- Bootstrap only the account explicitly designated by the platform owner.
insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'misael.abner16@gmail.com'
on conflict do nothing;

alter table public.locations
  add column if not exists customer_cancel_minimum_minutes integer not null default 0
  check (customer_cancel_minimum_minutes between 0 and 10080);

alter table public.customers
  add column if not exists notes text,
  add column if not exists is_fixed boolean not null default false;

alter table public.calendar_events
  add column if not exists customer_management_token_hash text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text check (cancelled_by in ('customer', 'staff', 'system')),
  add column if not exists cancellation_reason text,
  add column if not exists series_id uuid;
create unique index if not exists calendar_events_management_token_hash_key
  on public.calendar_events(customer_management_token_hash)
  where customer_management_token_hash is not null;
create index if not exists calendar_events_customer_status_idx
  on public.calendar_events(customer_id, status, starts_at);

create table public.appointment_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  starts_on date not null,
  ends_on date,
  max_occurrences integer,
  start_time time not null,
  monthly_day smallint,
  monthly_missing_day_rule text not null default 'skip' check (monthly_missing_day_rule = 'skip'),
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check (max_occurrences is null or max_occurrences between 1 and 240),
  check ((frequency = 'monthly' and monthly_day between 1 and 31) or (frequency <> 'monthly' and monthly_day is null)),
  unique (organization_id, id),
  foreign key (organization_id, location_id) references public.locations(organization_id, id),
  foreign key (organization_id, professional_id) references public.professionals(organization_id, id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id),
  foreign key (organization_id, service_id) references public.services(organization_id, id)
);
create index appointment_series_schedule_idx
  on public.appointment_series(organization_id, location_id, professional_id, is_active);
create trigger appointment_series_set_updated_at before update on public.appointment_series
  for each row execute function public.set_updated_at();
alter table public.calendar_events
  add constraint calendar_events_series_fkey foreign key (series_id)
  references public.appointment_series(id) on delete set null;
create index calendar_events_series_idx on public.calendar_events(series_id, starts_at);

alter table public.appointment_series enable row level security;
revoke all on table public.appointment_series from anon, authenticated;
grant select, insert, update on table public.appointment_series to authenticated;
create policy "schedule members manage appointment series" on public.appointment_series for all to authenticated
using (public.can_access_schedule(organization_id, professional_id) or (select public.is_platform_admin()))
with check (public.can_access_schedule(organization_id, professional_id) or (select public.is_platform_admin()));

-- Platform administrators can inspect and manage organizations without giving
-- that ability to ordinary organization members.
create policy "platform admins read profiles" on public.profiles for select to authenticated
using ((select public.is_platform_admin()));
create policy "platform admins read organizations" on public.organizations for select to authenticated
using ((select public.is_platform_admin()));
create policy "platform admins update organizations" on public.organizations for update to authenticated
using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins read memberships" on public.organization_memberships for select to authenticated
using ((select public.is_platform_admin()));
create policy "platform admins manage memberships" on public.organization_memberships for all to authenticated
using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins read customers" on public.customers for select to authenticated
using ((select public.is_platform_admin()));
create policy "platform admins update customers" on public.customers for update to authenticated
using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins read events" on public.calendar_events for select to authenticated
using ((select public.is_platform_admin()));

-- Existing RLS policies remain the authorization layer; these grants simply
-- make the management actions reachable through the Data API.
grant insert, update on table public.customers to authenticated;
grant update on table public.locations to authenticated;
grant insert, update on table public.organization_memberships to authenticated;

create or replace function public.book_public_appointment_with_management(
  p_slug text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text
)
returns table(event_id uuid, management_token text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  new_event_id uuid;
  new_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  new_event_id := public.book_public_appointment(
    p_slug, p_service_id, p_starts_at, p_customer_name, p_customer_phone
  );
  update public.calendar_events
  set customer_management_token_hash = encode(extensions.digest(convert_to(new_token, 'UTF8'), 'sha256'), 'hex')
  where id = new_event_id;
  return query select new_event_id, new_token;
end;
$$;

create or replace function public.get_public_booking_management(
  p_slug text,
  p_management_token text
)
returns table(
  event_id uuid,
  location_name text,
  time_zone text,
  service_name text,
  customer_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  customer_cancel_minimum_minutes integer,
  can_cancel boolean
)
language sql security definer set search_path = public, pg_temp as $$
  select e.id, l.name, l.time_zone, e.service_name, e.customer_name,
    e.starts_at, e.ends_at, e.status, l.customer_cancel_minimum_minutes,
    e.status = 'confirmed'
      and e.starts_at > now() + make_interval(mins => l.customer_cancel_minimum_minutes)
  from public.calendar_events e
  join public.locations l on l.id = e.location_id
  join public.organizations o on o.id = e.organization_id and o.is_active
  where lower(l.public_slug) = lower(trim(p_slug))
    and e.customer_management_token_hash = encode(extensions.digest(convert_to(p_management_token, 'UTF8'), 'sha256'), 'hex')
    and e.event_type = 'booking';
$$;

create or replace function public.cancel_public_booking(
  p_slug text,
  p_management_token text,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_event public.calendar_events%rowtype;
  target_location public.locations%rowtype;
begin
  select e.* into target_event
  from public.calendar_events e
  join public.locations l on l.id = e.location_id
  where lower(l.public_slug) = lower(trim(p_slug))
    and e.customer_management_token_hash = encode(extensions.digest(convert_to(p_management_token, 'UTF8'), 'sha256'), 'hex')
    and e.event_type = 'booking';
  if not found then raise exception 'Agendamento não encontrado' using errcode = 'P0002'; end if;
  select * into target_location from public.locations where id = target_event.location_id;
  if target_event.status <> 'confirmed' then raise exception 'Este agendamento já foi cancelado' using errcode = 'P0002'; end if;
  if target_event.starts_at <= now() + make_interval(mins => target_location.customer_cancel_minimum_minutes) then
    raise exception 'O prazo para cancelar este agendamento já passou' using errcode = '42501';
  end if;
  update public.calendar_events set status = 'cancelled', cancelled_at = now(),
    cancelled_by = 'customer', cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = target_event.id;
  insert into public.audit_logs (organization_id, action, entity_type, entity_id, before_data, after_data)
  values (target_event.organization_id, 'booking.cancelled_by_customer', 'calendar_event', target_event.id,
    jsonb_build_object('status', 'confirmed'), jsonb_build_object('status', 'cancelled'));
end;
$$;

create or replace function public.cancel_booking_as_staff(
  p_event_id uuid,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_event public.calendar_events%rowtype;
begin
  select * into target_event from public.calendar_events where id = p_event_id and event_type = 'booking';
  if not found then raise exception 'Agendamento não encontrado' using errcode = 'P0002'; end if;
  if not public.can_access_schedule(target_event.organization_id, target_event.professional_id)
    and not public.is_platform_admin() then
    raise exception 'Sem permissão para cancelar este agendamento' using errcode = '42501';
  end if;
  if target_event.status <> 'confirmed' then raise exception 'Este agendamento já foi cancelado' using errcode = 'P0002'; end if;
  update public.calendar_events set status = 'cancelled', cancelled_at = now(),
    cancelled_by = 'staff', cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = target_event.id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (target_event.organization_id, auth.uid(), 'booking.cancelled_by_staff', 'calendar_event', target_event.id,
    jsonb_build_object('status', 'confirmed'), jsonb_build_object('status', 'cancelled'));
end;
$$;

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
  if p_frequency not in ('weekly', 'biweekly', 'monthly') then raise exception 'Frequência inválida' using errcode = '22023'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'Data final inválida' using errcode = '22023'; end if;
  if p_max_occurrences is not null and p_max_occurrences not between 1 and 240 then raise exception 'Quantidade inválida' using errcode = '22023'; end if;
  select * into target_service from public.services
  where id = p_service_id and organization_id = target_location.organization_id and is_active;
  if not found then raise exception 'Serviço inválido' using errcode = '22023'; end if;
  if not exists (select 1 from public.customers c where c.id = p_customer_id and c.organization_id = target_location.organization_id) then
    raise exception 'Cliente inválido' using errcode = '22023'; end if;
  if not exists (select 1 from public.location_professionals lp where lp.location_id = p_location_id and lp.professional_id = p_professional_id and lp.is_active) then
    raise exception 'Profissional indisponível nesta unidade' using errcode = '22023'; end if;

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

create or replace function public.cancel_appointment_series(p_series_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_series public.appointment_series%rowtype;
begin
  select * into target_series from public.appointment_series where id = p_series_id;
  if not found then raise exception 'Série não encontrada' using errcode = 'P0002'; end if;
  if not public.can_access_schedule(target_series.organization_id, target_series.professional_id)
    and not public.is_platform_admin() then raise exception 'Sem permissão para cancelar a série' using errcode = '42501'; end if;
  update public.appointment_series set is_active = false where id = p_series_id;
  update public.calendar_events set status = 'cancelled', cancelled_at = now(), cancelled_by = 'staff', cancellation_reason = 'Série cancelada'
  where series_id = p_series_id and status = 'confirmed' and starts_at > now();
end;
$$;

revoke all on function public.book_public_appointment_with_management(text, uuid, timestamptz, text, text) from public;
revoke all on function public.get_public_booking_management(text, text) from public;
revoke all on function public.cancel_public_booking(text, text, text) from public;
revoke all on function public.cancel_booking_as_staff(uuid, text) from public;
revoke all on function public.create_recurring_booking(uuid, uuid, uuid, uuid, text, date, time, date, integer) from public;
revoke all on function public.cancel_appointment_series(uuid) from public;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.cancel_booking_as_staff(uuid, text) from anon;
revoke execute on function public.create_recurring_booking(uuid, uuid, uuid, uuid, text, date, time, date, integer) from anon;
revoke execute on function public.cancel_appointment_series(uuid) from anon;
grant execute on function public.book_public_appointment_with_management(text, uuid, timestamptz, text, text) to anon, authenticated;
grant execute on function public.get_public_booking_management(text, text) to anon, authenticated;
grant execute on function public.cancel_public_booking(text, text, text) to anon, authenticated;
grant execute on function public.cancel_booking_as_staff(uuid, text) to authenticated;
grant execute on function public.create_recurring_booking(uuid, uuid, uuid, uuid, text, date, time, date, integer) to authenticated;
grant execute on function public.cancel_appointment_series(uuid) to authenticated;

commit;
