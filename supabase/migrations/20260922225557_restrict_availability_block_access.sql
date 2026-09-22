begin;

revoke execute on function public.create_availability_block(
  uuid, uuid, text, date, date, smallint[], time without time zone,
  time without time zone, boolean
) from anon;

commit;
