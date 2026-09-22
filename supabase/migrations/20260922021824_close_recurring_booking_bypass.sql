begin;

-- Keep the implementation function private. Authenticated callers must use
-- create_customer_and_recurring_booking(), which validates every occurrence
-- against the same availability rules used by the public booking flow.
revoke execute on function public.create_recurring_booking(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  date,
  time without time zone,
  date,
  integer
) from anon, authenticated;

commit;
