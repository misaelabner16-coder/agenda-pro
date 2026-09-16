-- Agenda Pro MVP: schema, RLS and atomic booking functions.
-- Apply this file in the Supabase SQL editor or with the Supabase CLI.

create extension if not exists btree_gist;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  time_zone text not null default 'America/Sao_Paulo',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_slug_case_insensitive_key on public.businesses (lower(slug));

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  duration_minutes integer not null check (duration_minutes between 15 and 480 and duration_minutes % 15 = 0),
  price_cents integer not null check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_business_id_idx on public.services(business_id);

-- Sunday is 0 and Saturday is 6, matching PostgreSQL extract(dow ...).
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  week_day smallint not null check (week_day between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (business_id, week_day, start_time)
);
create index business_hours_business_day_idx on public.business_hours(business_id, week_day);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  -- Stored as digits only by the public booking function.
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);
create index customers_business_id_idx on public.customers(business_id);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null check (event_type in ('booking', 'block')),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text,
  service_id uuid references public.services(id) on delete set null,
  service_name text,
  service_duration_minutes integer,
  service_price_cents integer,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (
    (event_type = 'block' and customer_id is null and service_id is null)
    or (event_type = 'booking' and customer_id is not null and service_id is not null and customer_name is not null and customer_phone is not null)
  )
);
create index calendar_events_business_start_idx on public.calendar_events(business_id, starts_at);

-- The database is the last line of defense: two confirmed events from the
-- same business can never overlap, including a block and a booking.
alter table public.calendar_events add constraint calendar_events_no_overlaps
  exclude using gist (
    business_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger businesses_set_updated_at before update on public.businesses for each row execute function public.set_updated_at();
create trigger services_set_updated_at before update on public.services for each row execute function public.set_updated_at();
create trigger business_hours_set_updated_at before update on public.business_hours for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.business_hours enable row level security;
alter table public.customers enable row level security;
alter table public.calendar_events enable row level security;

create policy "profile owner manages profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "business owner manages business" on public.businesses for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "public reads active business" on public.businesses for select to anon, authenticated using (is_active = true);

create policy "owner manages services" on public.services for all to authenticated using (
  exists (select 1 from public.businesses b where b.id = services.business_id and b.owner_id = auth.uid())
) with check (exists (select 1 from public.businesses b where b.id = services.business_id and b.owner_id = auth.uid()));
create policy "public reads active services" on public.services for select to anon, authenticated using (
  is_active = true and exists (select 1 from public.businesses b where b.id = services.business_id and b.is_active = true)
);

create policy "owner manages hours" on public.business_hours for all to authenticated using (
  exists (select 1 from public.businesses b where b.id = business_hours.business_id and b.owner_id = auth.uid())
) with check (exists (select 1 from public.businesses b where b.id = business_hours.business_id and b.owner_id = auth.uid()));
create policy "public reads active business hours" on public.business_hours for select to anon, authenticated using (
  exists (select 1 from public.businesses b where b.id = business_hours.business_id and b.is_active = true)
);

create policy "owner manages customers" on public.customers for all to authenticated using (
  exists (select 1 from public.businesses b where b.id = customers.business_id and b.owner_id = auth.uid())
) with check (exists (select 1 from public.businesses b where b.id = customers.business_id and b.owner_id = auth.uid()));

create policy "owner reads events" on public.calendar_events for select to authenticated using (
  exists (select 1 from public.businesses b where b.id = calendar_events.business_id and b.owner_id = auth.uid())
);
create policy "owner creates blocks" on public.calendar_events for insert to authenticated with check (
  event_type = 'block' and exists (select 1 from public.businesses b where b.id = calendar_events.business_id and b.owner_id = auth.uid())
);
create policy "owner updates events" on public.calendar_events for update to authenticated using (
  exists (select 1 from public.businesses b where b.id = calendar_events.business_id and b.owner_id = auth.uid())
) with check (exists (select 1 from public.businesses b where b.id = calendar_events.business_id and b.owner_id = auth.uid()));
create policy "owner deletes blocks" on public.calendar_events for delete to authenticated using (
  event_type = 'block' and exists (select 1 from public.businesses b where b.id = calendar_events.business_id and b.owner_id = auth.uid())
);

create or replace function public.get_available_slots(p_slug text, p_service_id uuid, p_date date)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  target_business public.businesses%rowtype;
  target_service public.services%rowtype;
begin
  select * into target_business from public.businesses where lower(slug) = lower(trim(p_slug)) and is_active = true;
  if not found then raise exception 'Estabelecimento não encontrado' using errcode = 'P0002'; end if;
  select * into target_service from public.services where id = p_service_id and business_id = target_business.id and is_active = true;
  if not found then raise exception 'Serviço não encontrado' using errcode = 'P0002'; end if;

  return query
  with candidates as (
    select generated.slot_start, generated.slot_start + make_interval(mins => target_service.duration_minutes) as slot_end
    from public.business_hours h
    cross join lateral generate_series(
      ((p_date + h.start_time) at time zone target_business.time_zone),
      ((p_date + h.end_time - make_interval(mins => target_service.duration_minutes)) at time zone target_business.time_zone),
      interval '15 minutes'
    ) as generated(slot_start)
    where h.business_id = target_business.id and h.week_day = extract(dow from p_date)
  )
  select c.slot_start, c.slot_end from candidates c
  where c.slot_start >= now()
    and not exists (
      select 1 from public.calendar_events e
      where e.business_id = target_business.id and e.status = 'confirmed'
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
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_business public.businesses%rowtype;
  target_service public.services%rowtype;
  normalized_phone text := regexp_replace(p_customer_phone, '\D', '', 'g');
  target_customer_id uuid;
  new_event_id uuid;
  valid_slot boolean;
begin
  if char_length(trim(p_customer_name)) < 2 or normalized_phone !~ '^[0-9]{8,15}$' then
    raise exception 'Dados do cliente inválidos' using errcode = '22023';
  end if;
  select * into target_business from public.businesses where lower(slug) = lower(trim(p_slug)) and is_active = true;
  if not found then raise exception 'Estabelecimento não encontrado' using errcode = 'P0002'; end if;
  select * into target_service from public.services where id = p_service_id and business_id = target_business.id and is_active = true;
  if not found then raise exception 'Serviço não encontrado' using errcode = 'P0002'; end if;
  select exists(select 1 from public.get_available_slots(p_slug, p_service_id, (p_starts_at at time zone target_business.time_zone)::date) s where s.starts_at = p_starts_at) into valid_slot;
  if not valid_slot then raise exception 'Horário indisponível' using errcode = '23P01'; end if;

  insert into public.customers (business_id, name, phone) values (target_business.id, trim(p_customer_name), normalized_phone)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id into target_customer_id;

  insert into public.calendar_events (
    business_id, event_type, status, starts_at, ends_at, service_id, service_name,
    service_duration_minutes, service_price_cents, customer_id, customer_name, customer_phone
  ) values (
    target_business.id, 'booking', 'confirmed', p_starts_at,
    p_starts_at + make_interval(mins => target_service.duration_minutes), target_service.id, target_service.name,
    target_service.duration_minutes, target_service.price_cents, target_customer_id, trim(p_customer_name), normalized_phone
  ) returning id into new_event_id;
  return new_event_id;
exception when exclusion_violation then
  raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

revoke all on function public.get_available_slots(text, uuid, date) from public;
revoke all on function public.book_public_appointment(text, uuid, timestamptz, text, text) from public;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.book_public_appointment(text, uuid, timestamptz, text, text) to anon, authenticated;
