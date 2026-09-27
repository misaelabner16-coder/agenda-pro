-- ACTIVATE ONLY AFTER guarded booking is deployed and verified with server credentials.
-- Rolling the application back to the old anonymous writer after this is NOT compatible.
begin;
revoke all on function public.book_public_appointment(text,uuid,timestamptz,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.book_public_appointment_with_management(text,uuid,timestamptz,text,text)
  from public,anon,authenticated,service_role;
commit;
