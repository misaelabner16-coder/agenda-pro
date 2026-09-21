-- Explicitly override the project's legacy default function grants.
-- Public booking RPCs remain reachable by anonymous visitors; internal and
-- staff-only RPCs are not reachable through the Data API without login.

begin;

alter function public.set_updated_at() set search_path = public, pg_temp;

revoke execute on function public.is_organization_member(uuid) from anon, authenticated;
revoke execute on function public.has_organization_role(uuid, public.organization_role[]) from anon, authenticated;
revoke execute on function public.can_access_schedule(uuid, uuid) from anon, authenticated;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.create_profile_for_new_user() from anon, authenticated;

revoke execute on function public.create_organization_with_location(text, text, text) from anon;
revoke execute on function public.save_location_hours(uuid, jsonb) from anon;
revoke execute on function public.create_service_for_default_professional(uuid, uuid, text, integer, integer) from anon;
revoke execute on function public.create_schedule_block(uuid, uuid, date, time, time, text) from anon;
revoke execute on function public.cancel_booking_as_staff(uuid, text) from anon;
revoke execute on function public.create_recurring_booking(uuid, uuid, uuid, uuid, text, date, time, date, integer) from anon;
revoke execute on function public.cancel_appointment_series(uuid) from anon;

revoke execute on function public.book_public_appointment(text, uuid, timestamptz, text, text) from anon, authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.create_organization_with_location(text, text, text) to authenticated;
grant execute on function public.save_location_hours(uuid, jsonb) to authenticated;
grant execute on function public.create_service_for_default_professional(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.create_schedule_block(uuid, uuid, date, time, time, text) to authenticated;
grant execute on function public.cancel_booking_as_staff(uuid, text) to authenticated;
grant execute on function public.create_recurring_booking(uuid, uuid, uuid, uuid, text, date, time, date, integer) to authenticated;
grant execute on function public.cancel_appointment_series(uuid) to authenticated;

commit;
