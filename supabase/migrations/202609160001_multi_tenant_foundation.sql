-- Agenda Pro: additive foundation for organizations, locations, team roles,
-- and professional-based scheduling. This migration intentionally preserves
-- the MVP tables and maps every existing business to one organization,
-- location, and default professional.

begin;

create type public.organization_role as enum ('owner', 'manager', 'receptionist', 'professional');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organizations_slug_case_insensitive_key on public.organizations (lower(slug));

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_memberships_user_id_idx on public.organization_memberships(user_id, is_active);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  public_slug text not null check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  time_zone text not null default 'America/Sao_Paulo',
  is_active boolean not null default true,
  default_professional_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index locations_public_slug_case_insensitive_key on public.locations(lower(public_slug));
create index locations_organization_id_idx on public.locations(organization_id, is_active);

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(trim(display_name)) >= 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index professionals_one_user_per_organization_key
  on public.professionals(organization_id, user_id) where user_id is not null;

alter table public.locations
  add constraint locations_default_professional_organization_fkey
  foreign key (organization_id, default_professional_id)
  references public.professionals(organization_id, id);

create table public.location_professionals (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  is_active boolean not null default true,
  uses_location_hours boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, professional_id),
  unique (organization_id, location_id, professional_id),
  foreign key (organization_id, location_id) references public.locations(organization_id, id),
  foreign key (organization_id, professional_id) references public.professionals(organization_id, id)
);

create table public.location_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  week_day smallint not null check (week_day between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (location_id, week_day, start_time),
  foreign key (organization_id, location_id) references public.locations(organization_id, id)
);
create index location_hours_location_day_idx on public.location_hours(location_id, week_day);

create table public.professional_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  week_day smallint not null check (week_day between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  unique (location_id, professional_id, week_day, start_time),
  foreign key (organization_id, location_id) references public.locations(organization_id, id),
  foreign key (organization_id, professional_id) references public.professionals(organization_id, id),
  foreign key (location_id, professional_id) references public.location_professionals(location_id, professional_id)
);
create index professional_hours_schedule_idx on public.professional_hours(location_id, professional_id, week_day);

-- Existing operational tables gain an organization scope. Their original
-- business_id columns stay in place so no historical data is removed.
alter table public.services add column organization_id uuid;
alter table public.services alter column business_id drop not null;
alter table public.customers add column organization_id uuid;
alter table public.customers alter column business_id drop not null;
alter table public.calendar_events add column organization_id uuid;
alter table public.calendar_events add column location_id uuid;
alter table public.calendar_events add column professional_id uuid;
alter table public.calendar_events add column created_by_user_id uuid references auth.users(id) on delete set null;
alter table public.calendar_events alter column business_id drop not null;

create table public.professional_services (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (professional_id, service_id),
  unique (organization_id, professional_id, service_id),
  foreign key (organization_id, professional_id) references public.professionals(organization_id, id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_organization_created_idx on public.audit_logs(organization_id, created_at desc);

-- Backfill every existing business into the new hierarchy. Reusing the old
-- business UUID as the initial organization/location/professional UUID keeps
-- this data migration deterministic and fully reversible by backup.
insert into public.organizations (id, name, slug, is_active)
select id, name, slug, is_active from public.businesses
on conflict (id) do nothing;

insert into public.organization_memberships (organization_id, user_id, role, is_active)
select id, owner_id, 'owner'::public.organization_role, is_active from public.businesses
on conflict (organization_id, user_id) do update set role = excluded.role, is_active = excluded.is_active;

insert into public.locations (id, organization_id, name, public_slug, time_zone, is_active)
select id, id, name, slug, time_zone, is_active from public.businesses
on conflict (id) do nothing;

insert into public.professionals (id, organization_id, user_id, display_name, is_active)
select id, id, owner_id, name, is_active from public.businesses
on conflict (id) do nothing;

insert into public.location_professionals (organization_id, location_id, professional_id, is_active)
select id, id, id, is_active from public.businesses
on conflict (location_id, professional_id) do nothing;

update public.locations set default_professional_id = id where default_professional_id is null;

update public.services s set organization_id = b.id
from public.businesses b where s.business_id = b.id and s.organization_id is null;
update public.customers c set organization_id = b.id
from public.businesses b where c.business_id = b.id and c.organization_id is null;
update public.calendar_events e
set organization_id = b.id, location_id = b.id, professional_id = b.id, created_by_user_id = b.owner_id
from public.businesses b where e.business_id = b.id and e.organization_id is null;

insert into public.location_hours (id, organization_id, location_id, week_day, start_time, end_time, created_at, updated_at)
select h.id, h.business_id, h.business_id, h.week_day, h.start_time, h.end_time, h.created_at, h.updated_at
from public.business_hours h
on conflict (id) do nothing;

insert into public.professional_hours (organization_id, location_id, professional_id, week_day, start_time, end_time)
select h.business_id, h.business_id, h.business_id, h.week_day, h.start_time, h.end_time
from public.business_hours h
on conflict (location_id, professional_id, week_day, start_time) do nothing;

insert into public.professional_services (organization_id, professional_id, service_id)
select s.organization_id, s.organization_id, s.id from public.services s
where s.organization_id is not null
on conflict (professional_id, service_id) do nothing;

alter table public.services alter column organization_id set not null;
alter table public.customers alter column organization_id set not null;
alter table public.calendar_events alter column organization_id set not null;
alter table public.calendar_events alter column location_id set not null;
alter table public.calendar_events alter column professional_id set not null;

alter table public.services
  add constraint services_organization_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  add constraint services_organization_id_id_key unique (organization_id, id);
alter table public.customers
  add constraint customers_organization_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  add constraint customers_organization_phone_key unique (organization_id, phone),
  add constraint customers_organization_id_id_key unique (organization_id, id);
alter table public.calendar_events
  add constraint calendar_events_organization_fkey foreign key (organization_id) references public.organizations(id) on delete cascade,
  add constraint calendar_events_organization_location_fkey foreign key (organization_id, location_id) references public.locations(organization_id, id),
  add constraint calendar_events_organization_professional_fkey foreign key (organization_id, professional_id) references public.professionals(organization_id, id),
  add constraint calendar_events_organization_service_fkey foreign key (organization_id, service_id) references public.services(organization_id, id),
  add constraint calendar_events_organization_customer_fkey foreign key (organization_id, customer_id) references public.customers(organization_id, id);

alter table public.professional_services
  add constraint professional_services_organization_service_fkey
  foreign key (organization_id, service_id) references public.services(organization_id, id);

create index services_organization_id_idx on public.services(organization_id, is_active);
create index customers_organization_id_idx on public.customers(organization_id);
create index calendar_events_schedule_idx on public.calendar_events(organization_id, location_id, professional_id, starts_at);

-- A confirmed booking/block reserves one professional. Different
-- professionals can therefore work at the same time in the same location.
alter table public.calendar_events drop constraint if exists calendar_events_no_overlaps;
alter table public.calendar_events add constraint calendar_events_no_professional_overlaps
  exclude using gist (
    location_id with =,
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

create trigger organizations_set_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships for each row execute function public.set_updated_at();
create trigger locations_set_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger professionals_set_updated_at before update on public.professionals for each row execute function public.set_updated_at();
create trigger location_professionals_set_updated_at before update on public.location_professionals for each row execute function public.set_updated_at();
create trigger location_hours_set_updated_at before update on public.location_hours for each row execute function public.set_updated_at();
create trigger professional_hours_set_updated_at before update on public.professional_hours for each row execute function public.set_updated_at();
create trigger professional_services_set_updated_at before update on public.professional_services for each row execute function public.set_updated_at();

-- Security helpers are used by the RLS policies below. They are intentionally
-- small, stable, and do not accept a user id from the client.
create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  );
$$;

create or replace function public.has_organization_role(
  p_organization_id uuid,
  p_roles public.organization_role[]
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role = any(p_roles)
  );
$$;

create or replace function public.can_access_schedule(p_organization_id uuid, p_professional_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_organization_role(
    p_organization_id,
    array['owner', 'manager', 'receptionist']::public.organization_role[]
  ) or exists (
    select 1 from public.professionals p
    where p.id = p_professional_id
      and p.organization_id = p_organization_id
      and p.user_id = (select auth.uid())
      and p.is_active
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.locations enable row level security;
alter table public.professionals enable row level security;
alter table public.location_professionals enable row level security;
alter table public.location_hours enable row level security;
alter table public.professional_hours enable row level security;
alter table public.professional_services enable row level security;
alter table public.audit_logs enable row level security;

create policy "members read organizations" on public.organizations for select to authenticated
using (public.is_organization_member(id));
create policy "owners update organizations" on public.organizations for update to authenticated
using (public.has_organization_role(id, array['owner']::public.organization_role[]))
with check (public.has_organization_role(id, array['owner']::public.organization_role[]));

create policy "members read memberships" on public.organization_memberships for select to authenticated
using (
  user_id = (select auth.uid()) or public.has_organization_role(
    organization_id, array['owner', 'manager', 'receptionist']::public.organization_role[]
  )
);
create policy "owners manage memberships" on public.organization_memberships for all to authenticated
using (public.has_organization_role(organization_id, array['owner']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner']::public.organization_role[]));

create policy "members read locations" on public.locations for select to authenticated
using (public.is_organization_member(organization_id));
create policy "management manages locations" on public.locations for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

create policy "team reads professionals" on public.professionals for select to authenticated
using (
  user_id = (select auth.uid()) or public.has_organization_role(
    organization_id, array['owner', 'manager', 'receptionist']::public.organization_role[]
  )
);
create policy "management manages professionals" on public.professionals for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

create policy "team reads location professionals" on public.location_professionals for select to authenticated
using (public.is_organization_member(organization_id));
create policy "management manages location professionals" on public.location_professionals for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

create policy "team reads location hours" on public.location_hours for select to authenticated
using (public.is_organization_member(organization_id));
create policy "management manages location hours" on public.location_hours for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

create policy "team reads professional hours" on public.professional_hours for select to authenticated
using (public.can_access_schedule(organization_id, professional_id));
create policy "management or professional manages own hours" on public.professional_hours for all to authenticated
using (public.can_access_schedule(organization_id, professional_id))
with check (public.can_access_schedule(organization_id, professional_id));

create policy "team reads professional services" on public.professional_services for select to authenticated
using (public.is_organization_member(organization_id));
create policy "management manages professional services" on public.professional_services for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

create policy "operations read customers" on public.customers for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager', 'receptionist']::public.organization_role[]));
create policy "operations manage customers" on public.customers for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager', 'receptionist']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager', 'receptionist']::public.organization_role[]));

create policy "team reads organization services" on public.services for select to authenticated
using (public.is_organization_member(organization_id));
create policy "management manages organization services" on public.services for all to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]))
with check (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

create policy "team reads organization events" on public.calendar_events for select to authenticated
using (public.can_access_schedule(organization_id, professional_id));
create policy "team manages permitted organization events" on public.calendar_events for all to authenticated
using (public.can_access_schedule(organization_id, professional_id))
with check (public.can_access_schedule(organization_id, professional_id));

create policy "management reads audit logs" on public.audit_logs for select to authenticated
using (public.has_organization_role(organization_id, array['owner', 'manager']::public.organization_role[]));

-- The former direct public read policies are replaced by narrow RPCs below.
drop policy if exists "public reads active business" on public.businesses;
drop policy if exists "public reads active services" on public.services;
drop policy if exists "public reads active business hours" on public.business_hours;

revoke all on table public.businesses, public.services, public.business_hours, public.customers, public.calendar_events from anon;
revoke all on table public.organizations, public.organization_memberships, public.locations, public.professionals,
  public.location_professionals, public.location_hours, public.professional_hours, public.professional_services,
  public.audit_logs from anon;
revoke all on table public.organizations, public.organization_memberships, public.locations, public.professionals,
  public.location_professionals, public.location_hours, public.professional_hours, public.professional_services,
  public.audit_logs from authenticated;

grant select on table public.organizations, public.organization_memberships, public.locations, public.professionals,
  public.location_professionals, public.location_hours, public.professional_hours, public.professional_services,
  public.audit_logs, public.businesses, public.business_hours, public.customers to authenticated;
grant select, insert, update, delete on table public.services, public.calendar_events to authenticated;

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
  new_organization_id uuid := gen_random_uuid();
  new_location_id uuid := gen_random_uuid();
  new_professional_id uuid := gen_random_uuid();
  professional_name text;
begin
  if caller_id is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  if char_length(normalized_name) < 2 or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Dados da organização inválidos' using errcode = '22023';
  end if;

  select coalesce(nullif(trim(full_name), ''), normalized_name) into professional_name
  from public.profiles where id = caller_id;

  insert into public.organizations (id, name, slug) values (new_organization_id, normalized_name, normalized_slug);
  insert into public.organization_memberships (organization_id, user_id, role)
    values (new_organization_id, caller_id, 'owner');
  insert into public.locations (id, organization_id, name, public_slug, time_zone)
    values (new_location_id, new_organization_id, normalized_name, normalized_slug, coalesce(nullif(trim(p_time_zone), ''), 'America/Sao_Paulo'));
  insert into public.professionals (id, organization_id, user_id, display_name)
    values (new_professional_id, new_organization_id, caller_id, coalesce(professional_name, normalized_name));
  insert into public.location_professionals (organization_id, location_id, professional_id)
    values (new_organization_id, new_location_id, new_professional_id);
  update public.locations set default_professional_id = new_professional_id where id = new_location_id;

  return query select new_organization_id, new_location_id, new_professional_id;
end;
$$;

create or replace function public.save_location_hours(p_location_id uuid, p_hours jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id from public.locations where id = p_location_id;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0002'; end if;
  if not public.has_organization_role(target_organization_id, array['owner', 'manager']::public.organization_role[]) then
    raise exception 'Sem permissão para alterar horários' using errcode = '42501';
  end if;
  if jsonb_typeof(p_hours) <> 'array' then raise exception 'Horários inválidos' using errcode = '22023'; end if;

  if exists (
    with candidate as (
      select (x.value ->> 'week_day')::smallint as week_day,
             (x.value ->> 'start_time')::time as start_time,
             (x.value ->> 'end_time')::time as end_time,
             x.ordinality as position
      from jsonb_array_elements(p_hours) with ordinality as x(value, ordinality)
    )
    select 1 from candidate where week_day not between 0 and 6 or end_time <= start_time
  ) then raise exception 'Intervalos de funcionamento inválidos' using errcode = '22023'; end if;

  if exists (
    with candidate as (
      select (x.value ->> 'week_day')::smallint as week_day,
             (x.value ->> 'start_time')::time as start_time,
             (x.value ->> 'end_time')::time as end_time,
             x.ordinality as position
      from jsonb_array_elements(p_hours) with ordinality as x(value, ordinality)
    )
    select 1 from candidate a join candidate b
      on a.week_day = b.week_day and a.position < b.position
     and a.start_time < b.end_time and b.start_time < a.end_time
  ) then raise exception 'Os intervalos do mesmo dia não podem se sobrepor' using errcode = '22023'; end if;

  delete from public.location_hours where location_id = p_location_id;
  insert into public.location_hours (organization_id, location_id, week_day, start_time, end_time)
  select target_organization_id, p_location_id,
         (x.value ->> 'week_day')::smallint,
         (x.value ->> 'start_time')::time,
         (x.value ->> 'end_time')::time
  from jsonb_array_elements(p_hours) as x(value);

  -- The initial professional inherits the location schedule. Once the team
  -- module gives a professional an independent schedule it can set this flag
  -- to false and preserve their own professional_hours rows.
  if exists (
    select 1 from public.location_professionals lp
    join public.locations l on l.id = lp.location_id
    where lp.location_id = p_location_id
      and lp.professional_id = l.default_professional_id
      and lp.uses_location_hours
  ) then
    delete from public.professional_hours ph
    using public.locations l
    where l.id = p_location_id
      and ph.location_id = p_location_id
      and ph.professional_id = l.default_professional_id;
    insert into public.professional_hours (organization_id, location_id, professional_id, week_day, start_time, end_time)
    select target_organization_id, p_location_id, l.default_professional_id,
           (x.value ->> 'week_day')::smallint,
           (x.value ->> 'start_time')::time,
           (x.value ->> 'end_time')::time
    from public.locations l
    cross join jsonb_array_elements(p_hours) as x(value)
    where l.id = p_location_id;
  end if;
end;
$$;

create or replace function public.create_service_for_default_professional(
  p_organization_id uuid,
  p_professional_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_price_cents integer
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  new_service_id uuid;
begin
  if not public.has_organization_role(p_organization_id, array['owner', 'manager']::public.organization_role[]) then
    raise exception 'Sem permissão para criar serviços' using errcode = '42501';
  end if;
  if char_length(trim(p_name)) < 2 or p_duration_minutes not between 15 and 480
    or p_duration_minutes % 15 <> 0 or p_price_cents < 0 then
    raise exception 'Dados do serviço inválidos' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.professionals p
    where p.id = p_professional_id and p.organization_id = p_organization_id and p.is_active
  ) then raise exception 'Profissional inválido' using errcode = '22023'; end if;

  insert into public.services (organization_id, name, duration_minutes, price_cents)
  values (p_organization_id, trim(p_name), p_duration_minutes, p_price_cents)
  returning id into new_service_id;
  insert into public.professional_services (organization_id, professional_id, service_id)
  values (p_organization_id, p_professional_id, new_service_id);
  return new_service_id;
end;
$$;

create or replace function public.create_schedule_block(
  p_location_id uuid,
  p_professional_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_title text default 'Horário bloqueado'
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  new_event_id uuid;
begin
  select * into target_location from public.locations where id = p_location_id and is_active;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0002'; end if;
  if not public.can_access_schedule(target_location.organization_id, p_professional_id) then
    raise exception 'Sem permissão para bloquear este horário' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.location_professionals lp
    where lp.location_id = p_location_id and lp.professional_id = p_professional_id and lp.is_active
  ) then raise exception 'Profissional não atende nesta unidade' using errcode = '22023'; end if;
  if p_end_time <= p_start_time then raise exception 'Período inválido' using errcode = '22023'; end if;

  starts_at_value := make_timestamptz(extract(year from p_date)::integer, extract(month from p_date)::integer,
    extract(day from p_date)::integer, extract(hour from p_start_time)::integer, extract(minute from p_start_time)::integer, 0, target_location.time_zone);
  ends_at_value := make_timestamptz(extract(year from p_date)::integer, extract(month from p_date)::integer,
    extract(day from p_date)::integer, extract(hour from p_end_time)::integer, extract(minute from p_end_time)::integer, 0, target_location.time_zone);

  insert into public.calendar_events (
    organization_id, location_id, professional_id, event_type, status, title, starts_at, ends_at, created_by_user_id
  ) values (
    target_location.organization_id, p_location_id, p_professional_id, 'block', 'confirmed',
    coalesce(nullif(trim(p_title), ''), 'Horário bloqueado'), starts_at_value, ends_at_value, auth.uid()
  ) returning id into new_event_id;
  return new_event_id;
exception when exclusion_violation then
  raise exception 'Esse período já possui um agendamento ou bloqueio' using errcode = '23P01';
end;
$$;

create or replace function public.get_public_booking_page(p_slug text)
returns table(location_id uuid, organization_id uuid, organization_name text, location_name text, public_slug text, time_zone text)
language sql security definer set search_path = public, pg_temp as $$
  select l.id, o.id, o.name, l.name, l.public_slug, l.time_zone
  from public.locations l
  join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug)) and l.is_active and o.is_active;
$$;

create or replace function public.get_public_services(p_slug text)
returns table(id uuid, name text, duration_minutes integer, price_cents integer)
language sql security definer set search_path = public, pg_temp as $$
  select s.id, s.name, s.duration_minutes, s.price_cents
  from public.locations l
  join public.organizations o on o.id = l.organization_id and o.is_active
  join public.services s on s.organization_id = l.organization_id and s.is_active
  join public.professional_services ps on ps.service_id = s.id and ps.professional_id = l.default_professional_id and ps.is_active
  where lower(l.public_slug) = lower(trim(p_slug)) and l.is_active
  order by s.created_at;
$$;

create or replace function public.get_available_slots(p_slug text, p_service_id uuid, p_date date)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_location public.locations%rowtype;
  target_service public.services%rowtype;
  target_professional_id uuid;
begin
  select l.* into target_location from public.locations l
  join public.organizations o on o.id = l.organization_id
  where lower(l.public_slug) = lower(trim(p_slug)) and l.is_active and o.is_active;
  if not found then raise exception 'Estabelecimento não encontrado' using errcode = 'P0002'; end if;

  select * into target_service from public.services
  where id = p_service_id and organization_id = target_location.organization_id and is_active;
  if not found then raise exception 'Serviço não encontrado' using errcode = 'P0002'; end if;

  select lp.professional_id into target_professional_id
  from public.location_professionals lp
  join public.professional_services ps on ps.professional_id = lp.professional_id and ps.service_id = target_service.id and ps.is_active
  join public.professionals p on p.id = lp.professional_id and p.is_active
  where lp.location_id = target_location.id
    and lp.professional_id = target_location.default_professional_id
    and lp.is_active;
  if not found then raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002'; end if;

  return query
  with working_windows as (
    select greatest(lh.start_time, ph.start_time) as start_time,
           least(lh.end_time, ph.end_time) as end_time
    from public.location_hours lh
    join public.professional_hours ph
      on ph.location_id = lh.location_id and ph.professional_id = target_professional_id and ph.week_day = lh.week_day
    where lh.location_id = target_location.id and lh.week_day = extract(dow from p_date)
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
  select c.slot_start, c.slot_end from candidates c
  where c.slot_start >= now()
    and not exists (
      select 1 from public.calendar_events e
      where e.location_id = target_location.id
        and e.professional_id = target_professional_id
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
  normalized_phone text := regexp_replace(p_customer_phone, '\D', '', 'g');
  target_customer_id uuid;
  new_event_id uuid;
  valid_slot boolean;
begin
  if char_length(trim(p_customer_name)) < 2 or normalized_phone !~ '^[0-9]{8,15}$' then
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
  join public.professional_services ps on ps.professional_id = lp.professional_id and ps.service_id = target_service.id and ps.is_active
  where lp.location_id = target_location.id and lp.professional_id = target_location.default_professional_id and lp.is_active;
  if not found then raise exception 'Nenhum profissional disponível para este serviço' using errcode = 'P0002'; end if;

  select exists(
    select 1 from public.get_available_slots(
      p_slug, p_service_id, (p_starts_at at time zone target_location.time_zone)::date
    ) s where s.starts_at = p_starts_at
  ) into valid_slot;
  if not valid_slot then raise exception 'Horário indisponível' using errcode = '23P01'; end if;

  insert into public.customers (organization_id, name, phone)
  values (target_location.organization_id, trim(p_customer_name), normalized_phone)
  on conflict on constraint customers_organization_phone_key do update set name = excluded.name
  returning id into target_customer_id;

  insert into public.calendar_events (
    organization_id, location_id, professional_id, event_type, status, starts_at, ends_at,
    service_id, service_name, service_duration_minutes, service_price_cents,
    customer_id, customer_name, customer_phone
  ) values (
    target_location.organization_id, target_location.id, target_professional_id,
    'booking', 'confirmed', p_starts_at,
    p_starts_at + make_interval(mins => target_service.duration_minutes),
    target_service.id, target_service.name, target_service.duration_minutes, target_service.price_cents,
    target_customer_id, trim(p_customer_name), normalized_phone
  ) returning id into new_event_id;
  return new_event_id;
exception when exclusion_violation then
  raise exception 'Horário indisponível' using errcode = '23P01';
end;
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid, public.organization_role[]) from public;
revoke all on function public.can_access_schedule(uuid, uuid) from public;
revoke all on function public.create_organization_with_location(text, text, text) from public;
revoke all on function public.save_location_hours(uuid, jsonb) from public;
revoke all on function public.create_service_for_default_professional(uuid, uuid, text, integer, integer) from public;
revoke all on function public.create_schedule_block(uuid, uuid, date, time, time, text) from public;
revoke all on function public.get_public_booking_page(text) from public;
revoke all on function public.get_public_services(text) from public;
revoke all on function public.get_available_slots(text, uuid, date) from public;
revoke all on function public.book_public_appointment(text, uuid, timestamptz, text, text) from public;

grant execute on function public.create_organization_with_location(text, text, text) to authenticated;
grant execute on function public.save_location_hours(uuid, jsonb) to authenticated;
grant execute on function public.create_service_for_default_professional(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.create_schedule_block(uuid, uuid, date, time, time, text) to authenticated;
grant execute on function public.get_public_booking_page(text) to anon, authenticated;
grant execute on function public.get_public_services(text) to anon, authenticated;
grant execute on function public.get_available_slots(text, uuid, date) to anon, authenticated;
grant execute on function public.book_public_appointment(text, uuid, timestamptz, text, text) to anon, authenticated;

commit;
