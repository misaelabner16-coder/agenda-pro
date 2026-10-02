begin;

-- A suspended owner cannot use the existing self-service onboarding RPC to
-- create another organization while the original remains suspended.
create function public.prevent_suspended_owner_onboarding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = auth.uid() and m.role = 'owner' and not o.is_active
  ) then
    raise exception 'Conta vinculada a uma empresa suspensa' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_suspended_owner_onboarding() from public, anon, authenticated, service_role;
create trigger prevent_suspended_owner_onboarding
before insert on public.organizations for each row
execute function public.prevent_suspended_owner_onboarding();

commit;
