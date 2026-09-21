begin;

-- A professional can manage only the customers inside an organization where
-- they are an active member. This enables the fixed-client workflow without
-- widening access across organizations.
create policy "professionals read organization customers"
on public.customers
for select
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['professional']::public.organization_role[]
  )
);

create policy "professionals manage organization customers"
on public.customers
for all
to authenticated
using (
  public.has_organization_role(
    organization_id,
    array['professional']::public.organization_role[]
  )
)
with check (
  public.has_organization_role(
    organization_id,
    array['professional']::public.organization_role[]
  )
);

commit;
