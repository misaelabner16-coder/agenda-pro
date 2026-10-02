begin;

-- The original administrator seed ran before this account existed in Auth.
-- Only the already designated, confirmed owner account may be bootstrapped.
insert into public.platform_admins (user_id)
select id from auth.users
where lower(email) = 'misael.abner16@gmail.com' and email_confirmed_at is not null
on conflict do nothing;

create table public.platform_billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  plan_name text not null check (char_length(btrim(plan_name)) between 2 and 80),
  monthly_amount_cents integer not null check (monthly_amount_cents >= 0),
  due_day smallint not null check (due_day between 1 and 28),
  started_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_billing_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period_month date not null check (extract(day from period_month) = 1),
  amount_cents integer not null check (amount_cents >= 0),
  paid_on date not null,
  method text not null check (method in ('pix', 'boleto', 'card', 'transfer', 'other')),
  recorded_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, period_month)
);

create index platform_billing_payments_period_idx
on public.platform_billing_payments (period_month desc, organization_id);

alter table public.platform_billing_accounts enable row level security;
alter table public.platform_billing_payments enable row level security;
revoke all on public.platform_billing_accounts, public.platform_billing_payments from public, anon, authenticated;
grant select, insert, update on public.platform_billing_accounts to authenticated;
grant select, insert on public.platform_billing_payments to authenticated;

create policy "platform administrators manage billing accounts"
on public.platform_billing_accounts for all to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

create policy "platform administrators read payments"
on public.platform_billing_payments for select to authenticated
using ((select public.is_platform_admin()));

create policy "platform administrators record payments"
on public.platform_billing_payments for insert to authenticated
with check ((select public.is_platform_admin()) and recorded_by_user_id = (select auth.uid())
  and exists (select 1 from public.platform_billing_accounts b where b.organization_id = platform_billing_payments.organization_id));

-- There is deliberately no UPDATE or DELETE permission on a recorded payment.
-- A later correction flow should add a reversing entry with an explicit audit trail.

create function public.set_platform_organization_active(p_organization_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Sem permissão de administrador global' using errcode = '42501';
  end if;
  if p_organization_id is null or p_active is null then
    raise exception 'Organização e estado são obrigatórios' using errcode = '22023';
  end if;
  update public.organizations set is_active = p_active where id = p_organization_id;
  if not found then
    raise exception 'Organização não encontrada' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_platform_organization_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_platform_organization_active(uuid, boolean) to authenticated;

commit;
