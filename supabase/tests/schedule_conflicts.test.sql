begin;

select plan(4);

insert into public.organizations (id, name, slug)
values ('10000000-0000-0000-0000-000000000001', 'Organização de teste', 'organizacao-de-teste');
insert into public.locations (id, organization_id, name, public_slug)
values
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Unidade de teste', 'unidade-de-teste'),
  ('10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Segunda unidade', 'segunda-unidade-de-teste');
insert into public.professionals (id, organization_id, display_name)
values
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Profissional A'),
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Profissional B');
insert into public.location_professionals (organization_id, location_id, professional_id)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003');

select lives_ok(
  $$insert into public.calendar_events (organization_id, location_id, professional_id, event_type, starts_at, ends_at)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'block', '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00')$$,
  'o primeiro período do profissional é aceito'
);

select throws_ok(
  $$insert into public.calendar_events (organization_id, location_id, professional_id, event_type, starts_at, ends_at)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'block', '2026-12-01 09:30:00+00', '2026-12-01 10:30:00+00')$$,
  '23P01', null,
  'o banco rejeita sobreposição para o mesmo profissional'
);

select lives_ok(
  $$insert into public.calendar_events (organization_id, location_id, professional_id, event_type, starts_at, ends_at)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'block', '2026-12-01 09:30:00+00', '2026-12-01 10:30:00+00')$$,
  'profissionais diferentes podem atender no mesmo horário'
);

select throws_ok(
  $$insert into public.calendar_events (organization_id, location_id, professional_id, event_type, starts_at, ends_at)
    values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', 'block', '2026-12-01 09:30:00+00', '2026-12-01 10:30:00+00')$$,
  '23P01', null,
  'o mesmo profissional não pode atender simultaneamente em outra unidade'
);

select * from finish();
rollback;
