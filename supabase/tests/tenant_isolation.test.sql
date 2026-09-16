begin;

select plan(3);

insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'owner-a@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'owner-b@example.com');

insert into public.organizations (id, name, slug)
values
  ('20000000-0000-0000-0000-000000000011', 'Organização A', 'organizacao-a'),
  ('20000000-0000-0000-0000-000000000012', 'Organização B', 'organizacao-b');
insert into public.organization_memberships (organization_id, user_id, role)
values
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000002', 'owner');
insert into public.locations (id, organization_id, name, public_slug)
values
  ('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000011', 'Unidade A', 'unidade-a'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000012', 'Unidade B', 'unidade-b');

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';

select results_eq(
  $$select id::text from public.locations order by id$$,
  array['20000000-0000-0000-0000-000000000021']::text[],
  'o proprietário da organização A só enxerga a sua unidade'
);

select throws_ok(
  $$insert into public.services (organization_id, name, duration_minutes, price_cents)
    values ('20000000-0000-0000-0000-000000000012', 'Serviço da organização B', 30, 1000)$$,
  '42501', null,
  'o proprietário da organização A não cria serviços para a organização B'
);

set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';

select results_eq(
  $$select id::text from public.locations order by id$$,
  array['20000000-0000-0000-0000-000000000022']::text[],
  'o proprietário da organização B só enxerga a sua unidade'
);

select * from finish();
rollback;
