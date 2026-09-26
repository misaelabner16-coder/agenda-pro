begin;

-- Authorization reads current membership state, never a cached JWT role.
create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id and o.is_active
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.is_active
  );
$$;

create or replace function public.has_organization_role(
  p_organization_id uuid, p_roles public.organization_role[]
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id and o.is_active
    where m.organization_id = p_organization_id and m.user_id = auth.uid()
      and m.is_active and m.role = any(p_roles)
  );
$$;

create or replace function public.can_access_schedule(p_organization_id uuid, p_professional_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_organization_member(p_organization_id) and (
    public.has_organization_role(p_organization_id,
      array['owner', 'manager', 'receptionist']::public.organization_role[])
    or exists (
      select 1 from public.professionals p
      where p.id = p_professional_id and p.organization_id = p_organization_id
        and p.user_id = auth.uid() and p.is_active
    )
  );
$$;

revoke all on function public.is_organization_member(uuid),
  public.has_organization_role(uuid, public.organization_role[]),
  public.can_access_schedule(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_organization_member(uuid),
  public.has_organization_role(uuid, public.organization_role[]),
  public.can_access_schedule(uuid, uuid) to authenticated;

-- Keep legacy data, retire the second authorization model.
drop policy if exists "business owner manages business" on public.businesses;
drop policy if exists "owner manages hours" on public.business_hours;
drop policy if exists "owner manages services" on public.services;
drop policy if exists "owner manages customers" on public.customers;
drop policy if exists "owner reads events" on public.calendar_events;
drop policy if exists "owner creates blocks" on public.calendar_events;
drop policy if exists "owner updates events" on public.calendar_events;
drop policy if exists "owner deletes blocks" on public.calendar_events;

-- Normalize table AND column ACLs, including grants inherited from PUBLIC.
-- Objects/rows are not removed, and service_role is not granted to the browser.
do $$
declare target regclass; columns_sql text;
begin
  foreach target in array array[
    'public.businesses'::regclass, 'public.business_hours'::regclass,
    'public.profiles'::regclass, 'public.calendar_events'::regclass,
    'public.appointment_series'::regclass
  ] loop
    execute format('revoke all on table %s from public, anon, authenticated', target);
    select string_agg(quote_ident(attname), ', ') into columns_sql
    from pg_attribute where attrelid = target and attnum > 0 and not attisdropped;
    execute format('revoke all (%s) on table %s from public, anon, authenticated', columns_sql, target);
  end loop;
end;
$$;

grant select on public.profiles, public.calendar_events, public.appointment_series to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- The only direct event mutation used by the existing UI is removing a block.
-- Bookings can only be changed through the authorized RPCs; never hard deleted.
drop policy if exists "team manages permitted organization events" on public.calendar_events;
create policy "schedule members delete blocks only" on public.calendar_events
for delete to authenticated
using (event_type = 'block' and public.can_access_schedule(organization_id, professional_id));
grant delete on public.calendar_events to authenticated;

drop policy if exists "team reads professionals" on public.professionals;
create policy "team reads professionals" on public.professionals for select to authenticated
using (public.is_organization_member(organization_id) and (
  user_id = auth.uid() or public.has_organization_role(organization_id,
    array['owner', 'manager', 'receptionist']::public.organization_role[])
));

drop policy if exists "members read memberships" on public.organization_memberships;
create policy "members read memberships" on public.organization_memberships for select to authenticated
using (public.is_organization_member(organization_id) and (
  user_id = auth.uid() or public.has_organization_role(organization_id,
    array['owner', 'manager', 'receptionist']::public.organization_role[])
));

-- Resolve identities from confirmed Supabase Auth emails, never editable profiles.
create function public.grant_organization_access(
  p_organization_id uuid, p_email text, p_role public.organization_role
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid; normalized_email text := lower(btrim(p_email));
begin
  if not public.is_platform_admin() then
    raise exception 'Sem permissão de administrador global' using errcode = '42501';
  end if;
  if normalized_email is null or char_length(normalized_email) not between 3 and 254
    or p_role is null then
    raise exception 'Dados de acesso inválidos' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations where id = p_organization_id and is_active) then
    raise exception 'Organização indisponível' using errcode = 'P0002';
  end if;
  select u.id into target_user_id from auth.users u
  where lower(u.email) = normalized_email and u.email_confirmed_at is not null;
  if not found then
    raise exception 'A pessoa precisa cadastrar e confirmar o e-mail antes de receber acesso' using errcode = 'P0002';
  end if;
  insert into public.organization_memberships (organization_id, user_id, role, is_active)
  values (p_organization_id, target_user_id, p_role, true)
  on conflict (organization_id, user_id) do update set role = excluded.role, is_active = true;
end;
$$;
revoke all on function public.grant_organization_access(uuid, text, public.organization_role)
  from public, anon, authenticated;
grant execute on function public.grant_organization_access(uuid, text, public.organization_role) to authenticated;

-- Keep the display copy synchronized, without trusting it for authorization.
create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.create_profile_for_new_user();

commit;
