begin;

select plan(5);

insert into public.organizations (id, name, slug)
values ('30000000-0000-0000-0000-000000000001', 'Agenda disponibilidade', 'agenda-disponibilidade');
insert into public.professionals (id, organization_id, display_name)
values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Profissional');
insert into public.locations (id, organization_id, name, public_slug, time_zone, default_professional_id)
values ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Unidade', 'agenda-disponibilidade', 'America/Sao_Paulo', '30000000-0000-0000-0000-000000000003');
insert into public.location_professionals (organization_id, location_id, professional_id)
values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003');
insert into public.services (id, organization_id, name, duration_minutes, price_cents)
values ('30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'Serviço de 60 minutos', 60, 5000);
insert into public.professional_services (organization_id, professional_id, service_id)
values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004');
insert into public.location_hours (organization_id, location_id, week_day, start_time, end_time)
values
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', extract(dow from date '2030-01-07'), '09:00', '12:00'),
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', extract(dow from date '2030-01-07'), '13:00', '17:00');
insert into public.professional_hours (organization_id, location_id, professional_id, week_day, start_time, end_time)
values
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', extract(dow from date '2030-01-07'), '09:00', '12:00'),
  ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', extract(dow from date '2030-01-07'), '13:00', '17:00');

select is(
  (select max(starts_at at time zone 'America/Sao_Paulo')::time from public.get_available_slots('agenda-disponibilidade', '30000000-0000-0000-0000-000000000004', '2030-01-07') where (starts_at at time zone 'America/Sao_Paulo')::time < '12:00'),
  time '11:00',
  'o serviço inteiro cabe antes do fim do expediente'
);

select is(
  (select count(*)::integer from public.get_available_slots('agenda-disponibilidade', '30000000-0000-0000-0000-000000000004', '2030-01-07') where (starts_at at time zone 'America/Sao_Paulo')::time between '12:00' and '12:59:59'),
  0,
  'a pausa entre expedientes nunca vira horário disponível'
);

insert into public.calendar_events (organization_id, location_id, professional_id, event_type, starts_at, ends_at)
values ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'block', '2030-01-07 13:30 America/Sao_Paulo', '2030-01-07 14:30 America/Sao_Paulo');

select is(
  (select count(*)::integer from public.get_available_slots('agenda-disponibilidade', '30000000-0000-0000-0000-000000000004', '2030-01-07') where tstzrange(starts_at, ends_at, '[)') && tstzrange('2030-01-07 13:30 America/Sao_Paulo', '2030-01-07 14:30 America/Sao_Paulo', '[)')),
  0,
  'bloqueios removem todos os horários que os atravessam'
);

update public.services set is_active = false where id = '30000000-0000-0000-0000-000000000004';
select throws_ok(
  $$select * from public.get_available_slots('agenda-disponibilidade', '30000000-0000-0000-0000-000000000004', '2030-01-07')$$,
  'P0002', null,
  'serviço inativo não tem disponibilidade'
);
update public.services set is_active = true where id = '30000000-0000-0000-0000-000000000004';
update public.professionals set is_active = false where id = '30000000-0000-0000-0000-000000000003';
select throws_ok(
  $$select * from public.get_available_slots('agenda-disponibilidade', '30000000-0000-0000-0000-000000000004', '2030-01-07')$$,
  'P0002', null,
  'profissional inativo não tem disponibilidade'
);

select * from finish();
rollback;
