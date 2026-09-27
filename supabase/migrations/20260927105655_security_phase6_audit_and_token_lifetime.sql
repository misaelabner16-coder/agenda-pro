begin;
-- Enforce text bounds on direct API/RPC paths too. Validation fails safely if legacy
-- rows violate a bound; never truncate or delete existing data to make this pass.
alter table public.organizations add constraint organization_input_size check (char_length(name)<=120 and char_length(slug)<=80) not valid;
alter table public.locations add constraint location_input_size check (char_length(name)<=120 and char_length(public_slug)<=80) not valid;
alter table public.services add constraint service_input_size check (char_length(name)<=120) not valid;
alter table public.customers add constraint customer_input_size check (char_length(name)<=100 and char_length(phone)<=15) not valid;
alter table public.availability_blocks add constraint availability_block_title_size check (char_length(title)<=120) not valid;
alter table public.calendar_events add constraint calendar_free_text_size check (char_length(title)<=120 and char_length(cancellation_reason)<=500) not valid;
alter table public.organizations validate constraint organization_input_size;
alter table public.locations validate constraint location_input_size;
alter table public.services validate constraint service_input_size;
alter table public.customers validate constraint customer_input_size;
alter table public.availability_blocks validate constraint availability_block_title_size;
alter table public.calendar_events validate constraint calendar_free_text_size;
-- Capture business changes even when an authorized user calls the Data API directly.
-- Whitelist metadata: no names, phones, emails, reasons, passwords or token hashes.
create function public.audit_critical_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 v_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 v_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 v_row jsonb; v_org uuid; v_before jsonb; v_after jsonb; v_changed jsonb;
 v_allowed text[]:=array['role','is_active','user_id','organization_id','location_id',
 'professional_id','service_id','customer_id','series_id','event_type','status',
 'starts_at','ends_at','duration_minutes','price_cents','service_duration_minutes',
 'service_price_cents','week_day','week_days','start_time','end_time','start_date',
 'end_date','is_all_day','time_zone','default_professional_id','customer_cancel_minimum_minutes'];
begin
 v_row:=case when tg_op='DELETE' then v_old else v_new end;
 v_org:=case when tg_table_name='organizations' then (v_row->>'id')::uuid else (v_row->>'organization_id')::uuid end;
 -- Parent deletion cascades remove its existing audit rows; never recreate orphan logs.
 if not exists(select 1 from public.organizations where id=v_org) then return null; end if;
 select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into v_changed from
   (select jsonb_object_keys(v_old||v_new) k) keys
   where k not in ('updated_at','customer_management_token_hash')
     and v_old->k is distinct from v_new->k;
 if tg_op='UPDATE' and v_changed='[]'::jsonb then return null; end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_before from jsonb_each(v_old) where key=any(v_allowed);
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_after from jsonb_each(v_new) where key=any(v_allowed);
 insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(v_org,auth.uid(),'entity.'||lower(tg_op),tg_table_name,(v_row->>'id')::uuid,
   case when tg_op='INSERT' then null else jsonb_build_object('fields',v_before) end,
   jsonb_build_object('fields',v_after,'changed_fields',v_changed));
 return null;
end $$;
revoke all on function public.audit_critical_change() from public,anon,authenticated,service_role;
do $$ declare t text; begin
 foreach t in array array['organizations','organization_memberships','locations','professionals',
  'services','customers','location_hours','professional_hours','availability_blocks',
  'calendar_events','appointment_series'] loop
  execute format('create trigger security_audit_change after insert or update or delete on public.%I for each row execute function public.audit_critical_change()',t);
 end loop;
end $$;
revoke insert,update,delete,truncate,references,trigger on public.audit_logs from public,anon,authenticated,service_role;

-- Bearer read access ends 30 days after the appointment, or cancellation when cancelled.
-- Future confirmed bookings keep working; the professional retains normal historical access.
create or replace function public.get_public_booking_management(p_slug text,p_management_token text)
returns table(event_id uuid,location_name text,time_zone text,service_id uuid,service_name text,
 customer_name text,starts_at timestamptz,ends_at timestamptz,status text,
 customer_cancel_minimum_minutes integer,can_cancel boolean,can_reschedule boolean)
language sql security definer set search_path = '' as $$
 select e.id,l.name,l.time_zone,e.service_id,e.service_name,e.customer_name,e.starts_at,e.ends_at,e.status,
 l.customer_cancel_minimum_minutes,
 e.status='confirmed' and e.starts_at>now()+make_interval(mins=>l.customer_cancel_minimum_minutes),
 e.status='confirmed' and e.starts_at>now()+make_interval(mins=>l.customer_cancel_minimum_minutes)
 from public.calendar_events e
 join public.locations l on l.id=e.location_id and l.organization_id=e.organization_id
 join public.organizations o on o.id=e.organization_id and o.is_active
 where lower(l.public_slug)=lower(trim(p_slug)) and e.event_type='booking'
 and p_management_token ~ '^[a-fA-F0-9]{64}$'
 and e.customer_management_token_hash=encode(extensions.digest(convert_to(p_management_token,'UTF8'),'sha256'),'hex')
 and now() < (case when e.status='cancelled' then coalesce(e.cancelled_at,e.ends_at) else e.ends_at end)+interval '30 days';
$$;
revoke all on function public.get_public_booking_management(text,text) from public;
grant execute on function public.get_public_booking_management(text,text) to anon,authenticated;
commit;
