begin;

-- Supabase grants new public-schema functions to API roles automatically.
-- Only the management-token wrapper is a public booking entry point; the
-- underlying function must not create bookings that the customer cannot manage.
revoke execute on function public.book_public_appointment(text, uuid, timestamptz, text, text)
  from anon, authenticated;

revoke execute on function public.create_customer_and_recurring_booking(
  uuid, uuid, text, text, uuid, text, date, time, date, integer
) from anon;
grant execute on function public.create_customer_and_recurring_booking(
  uuid, uuid, text, text, uuid, text, date, time, date, integer
) to authenticated;

commit;
