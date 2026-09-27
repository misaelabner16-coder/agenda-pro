-- PREPARE only: deploy the server gateway before applying the retirement migration.
begin;
create table public.booking_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  expires_at timestamptz not null,
  hits integer not null check (hits > 0)
);
create index booking_rate_limits_expiry_idx on public.booking_rate_limits(expires_at);
alter table public.booking_rate_limits enable row level security;
revoke all on public.booking_rate_limits from public, anon, authenticated, service_role;

create function public.consume_booking_quota(p_bucket text, p_seconds integer, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  insert into public.booking_rate_limits as r(bucket,window_started_at,expires_at,hits)
  values(p_bucket,statement_timestamp(),statement_timestamp()+make_interval(secs=>p_seconds),1)
  on conflict(bucket) do update set
    window_started_at=case when r.expires_at <= statement_timestamp() then statement_timestamp() else r.window_started_at end,
    expires_at=case when r.expires_at <= statement_timestamp() then statement_timestamp()+make_interval(secs=>p_seconds) else r.expires_at end,
    hits=case when r.expires_at <= statement_timestamp() then 1 else r.hits+1 end
  where r.expires_at <= statement_timestamp() or r.hits < p_limit
  returning hits into v_hits;
  return v_hits is not null;
end;
$$;
revoke all on function public.consume_booking_quota(text,integer,integer) from public,anon,authenticated,service_role;

create function public.book_public_appointment_guarded(
  p_slug text, p_service_id uuid, p_starts_at timestamptz,
  p_customer_name text, p_customer_phone text, p_client_digest text, p_phone_digest text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result record; v_code text;
begin
  -- Digests come ONLY from the server, using a keyed HMAC; never trust client headers/JSON.
  if p_client_digest is null or p_client_digest !~ '^[a-f0-9]{64}$'
    or p_phone_digest is null or p_phone_digest !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('error_code','22023');
  end if;
  -- Bounded opportunistic cleanup. No customer data/IPs are stored in this table.
  delete from public.booking_rate_limits where bucket in (
    select bucket from public.booking_rate_limits where expires_at < statement_timestamp()-interval '1 day'
    order by expires_at limit 128 for update skip locked
  );
  -- Stable lock order across requests; counters are atomic across all server instances.
  if not public.consume_booking_quota('ip-minute:'||p_client_digest,60,10) then
    return jsonb_build_object('error_code','RATE_LIMITED','retry_after',60);
  end if;
  if not public.consume_booking_quota('ip-day:'||p_client_digest,86400,100) then
    return jsonb_build_object('error_code','RATE_LIMITED','retry_after',86400);
  end if;
  if not public.consume_booking_quota('phone-hour:'||p_phone_digest,3600,10) then
    return jsonb_build_object('error_code','RATE_LIMITED','retry_after',3600);
  end if;
  begin
    select * into v_result from public.book_public_appointment_with_management(
      p_slug,p_service_id,p_starts_at,p_customer_name,p_customer_phone);
    return jsonb_build_object('event_id',v_result.event_id,'management_token',v_result.management_token);
  exception when others then
    -- Roll back only the booking subtransaction, retaining attempted-request quotas.
    get stacked diagnostics v_code = returned_sqlstate;
    return jsonb_build_object('error_code',case when v_code in ('23P01','P0002','22023') then v_code else 'BOOKING_FAILED' end);
  end;
end;
$$;
revoke all on function public.book_public_appointment_guarded(text,uuid,timestamptz,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.book_public_appointment_guarded(text,uuid,timestamptz,text,text,text,text) to service_role;
commit;
