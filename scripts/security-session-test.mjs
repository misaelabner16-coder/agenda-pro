// Explicit remote integration test. Never loads .env.local (the legacy project).
// Privileged credentials are used ONLY to provision/clean this run's fixtures.
// Every authorization assertion goes through HTTP with a normal signed user JWT.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const project = 'nuhxuhkunhuzljjjkzbx';
const url = `https://${project}.supabase.co`;
const cli = process.env.SUPABASE_CLI_PATH || 'C:/Users/misael/AppData/Local/Temp/agenda-pro-supabase-cli-3771594b-4ce3-463b-814b-7c04b50499fb/supabase.exe';
if (!process.argv.includes('--confirm-sao-paulo-fixtures')) {
  throw new Error('Requires --confirm-sao-paulo-fixtures; creates and removes only random test fixtures.');
}
function cliJson(args) {
  let output;
  try {
    output = execFileSync(cli, args, { encoding: 'utf8', timeout: 60000,
      env: { ...process.env, NODE_USE_SYSTEM_CA: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw new Error('CLI operation failed; raw output suppressed to protect credentials.'); }
  const start = output.search(/[\[{]/);
  if (start < 0) throw new Error('Expected CLI JSON');
  return JSON.parse(output.slice(start));
}
function sql(query) {
  const file = join(tmpdir(), `agenda-session-${randomUUID()}.sql`);
  try {
    writeFileSync(file, query, { flag: 'wx', mode: 0o600 });
    return cliJson(['db', 'query', '--linked', '--project-ref', project, '--file', file]).rows;
  } finally { unlinkSync(file); }
}
const keys = cliJson(['projects', 'api-keys', '--project-ref', project, '--output', 'json']);
const publicKey = keys.find(k => k.type === 'publishable')?.api_key || keys.find(k => k.name === 'anon')?.api_key;
const adminKey = keys.find(k => k.name === 'service_role')?.api_key;
if (!publicKey || !adminKey) throw new Error('Required API keys unavailable');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, adminKey, options);
const users = [];
const workspaces = [];
const passed = [];
const gatewayMode = process.argv.includes('--gateway');
const rateDigests = [];
const uuid = value => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid fixture UUID');
  return `'${value}'`;
};
async function rest(token, path, method = 'GET', body) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: { apikey: publicKey, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
const check = (name, ok) => { assert.equal(Boolean(ok), true, name); passed.push(name); };
async function makeWorkspace() {
  const suffix = randomUUID();
  const email = `audit-http-${suffix}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Create fixture user failed (${created.error?.code || 'unknown'})`);
  const user = created.data.user;
  users.push({ id: user.id, email });
  const login = await createClient(url, publicKey, options).auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error(`Fixture login failed (${login.error?.code || 'unknown'})`);
  const token = login.data.session.access_token;
  const slug = `audit-http-${suffix}`;
  const response = await rest(token, 'rpc/create_organization_with_location', 'POST', {
    p_name: 'Security HTTP fixture', p_public_slug: slug, p_time_zone: 'America/Sao_Paulo',
  });
  check('Authenticated onboarding creates workspace ' + workspaces.length, response.status === 200 && response.data?.length === 1);
  const workspace = { ...response.data[0], userId: user.id, token, slug };
  for (const key of ['organization_id', 'location_id', 'professional_id']) uuid(workspace[key]);
  workspaces.push(workspace);
  return workspace;
}
try {
  const a = await makeWorkspace();
  const b = await makeWorkspace();
  // The actual vulnerable path was a professional whose membership was removed.
  sql(`begin;
    update public.organization_memberships set role='professional' where organization_id=${uuid(a.organization_id)} and user_id=${uuid(a.userId)};
    insert into public.calendar_events(organization_id,location_id,professional_id,event_type,starts_at,ends_at)
    values (${uuid(a.organization_id)},${uuid(a.location_id)},${uuid(a.professional_id)},'block',now()+interval '30 days',now()+interval '30 days 30 minutes'),
      (${uuid(b.organization_id)},${uuid(b.location_id)},${uuid(b.professional_id)},'block',now()+interval '30 days',now()+interval '30 days 30 minutes');
    commit; select true as fixture_ready;`);
  const readA = await rest(a.token, `calendar_events?select=id&organization_id=eq.${a.organization_id}`);
  check('Signed JWT reads own agenda before removal', readA.status === 200 && readA.data?.length === 1);
  const readB = await rest(a.token, `calendar_events?select=id&organization_id=eq.${b.organization_id}`);
  check('Signed A JWT cannot read B agenda', readB.status === 200 && readB.data?.length === 0);
  const readOther = await rest(b.token, `calendar_events?select=id&organization_id=eq.${a.organization_id}`);
  check('Signed B JWT cannot read A agenda', readOther.status === 200 && readOther.data?.length === 0);
  const writeB = await rest(a.token, 'customers', 'POST', { organization_id: b.organization_id, name: 'Forbidden fixture', phone: '11900000000' });
  check('Signed A JWT cannot create B customer', writeB.status === 403 && writeB.data?.code === '42501');
  const updateB = await rest(a.token, `calendar_events?organization_id=eq.${b.organization_id}`, 'PATCH', { status: 'cancelled' });
  check('Direct event mutation rejected via HTTP', updateB.status === 403 && updateB.data?.code === '42501');
  sql(`delete from public.organization_memberships where organization_id=${uuid(a.organization_id)} and user_id=${uuid(a.userId)}; select true as membership_removed;`);
  // a.token is a const captured at password sign-in. No refresh or reauthentication.
  const removed = await rest(a.token, `calendar_events?select=id&organization_id=eq.${a.organization_id}`);
  check('Previously issued signed JWT loses agenda access immediately', removed.status === 200 && removed.data?.length === 0);
  const professional = await rest(a.token, `professionals?select=id&id=eq.${a.professional_id}`);
  check('Old JWT cannot read its former professional row', professional.status === 200 && professional.data?.length === 0);
  const helper = await rest(a.token, 'rpc/can_access_schedule', 'POST', { p_organization_id: a.organization_id, p_professional_id: a.professional_id });
  check('Old JWT loses schedule RPC authorization', helper.status === 200 && helper.data === false);
  const removeBlock = await rest(a.token, `calendar_events?organization_id=eq.${a.organization_id}`, 'DELETE');
  check('Old JWT cannot delete its former blocks', removeBlock.status === 200 && removeBlock.data?.length === 0);
  if (process.argv.includes('--phase2') || gatewayMode) {
    const service = randomUUID();
    const secondProfessional = randomUUID();
    const day = sql(`select (current_date+40)::text as day;`)[0].day;
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
    sql(`begin;
      insert into public.services(id,organization_id,name,duration_minutes,price_cents)
        values(${uuid(service)},${uuid(b.organization_id)},'Concurrency fixture',60,2500);
      insert into public.professional_services(organization_id,professional_id,service_id)
        values(${uuid(b.organization_id)},${uuid(b.professional_id)},${uuid(service)});
      insert into public.location_hours(organization_id,location_id,week_day,start_time,end_time)
        select ${uuid(b.organization_id)},${uuid(b.location_id)},d,'09:00','12:00' from generate_series(0,6) d;
      insert into public.professional_hours(organization_id,location_id,professional_id,week_day,start_time,end_time)
        select ${uuid(b.organization_id)},${uuid(b.location_id)},${uuid(b.professional_id)},d,'09:00','12:00' from generate_series(0,6) d;
      insert into public.professionals(id,organization_id,display_name)
        values(${uuid(secondProfessional)},${uuid(b.organization_id)},'Second concurrency fixture');
      insert into public.location_professionals(organization_id,location_id,professional_id)
        values(${uuid(b.organization_id)},${uuid(b.location_id)},${uuid(secondProfessional)});
      commit; select true as ready;`);
    const anonymous = keys.find(k => k.name === 'anon')?.api_key;
    if (!anonymous) throw new Error('Anonymous JWT unavailable for direct RPC integration test');
    const publicRpc = (name, body) => rest(anonymous, `rpc/${name}`, 'POST', body);
    const gatewayIp = randomBytes(32).toString('hex');
    const gatewayPhone = randomBytes(32).toString('hex');
    rateDigests.push(gatewayIp, gatewayPhone);
    const bookingArgs = {
      p_slug: b.slug, p_service_id: service, p_starts_at: `${day}T09:00:00-03:00`,
      p_customer_name: 'Race fixture', p_customer_phone: '11900000008',
    };
    const makeBooking = async () => {
      if (!gatewayMode) return publicRpc('book_public_appointment_with_management', bookingArgs);
      // service_role is the actual authorized gateway role, not an RLS-test shortcut.
      const result = await admin.rpc('book_public_appointment_guarded', { ...bookingArgs, p_client_digest: gatewayIp, p_phone_digest: gatewayPhone });
      if (result.error) throw new Error('Guarded RPC transport failed');
      return result.data.error_code ? { status: 409, data: { code: result.data.error_code } } : { status: 200, data: [result.data] };
    };
    const race = await Promise.all([makeBooking(), makeBooking()]);
    check('Concurrent public booking: exactly one succeeds', race.filter(r => r.status === 200).length === 1);
    check('Concurrent public booking: loser is controlled overlap error', race.filter(r => r.data?.code === '23P01').length === 1);
    const booking = race.find(r => r.status === 200).data[0];
    uuid(booking.event_id);
    const counts = sql(`select (select count(*) from public.calendar_events where organization_id=${uuid(b.organization_id)} and event_type='booking') as bookings,
      (select count(*) from public.customers where organization_id=${uuid(b.organization_id)}) as customers;`)[0];
    check('Concurrent loser leaves no duplicate booking/customer', Number(counts.bookings) === 1 && Number(counts.customers) === 1);
    sql(`begin;
      insert into public.calendar_events(organization_id,location_id,professional_id,event_type,starts_at,ends_at,
        service_id,service_name,service_duration_minutes,service_price_cents,customer_id,customer_name,customer_phone)
      select organization_id,location_id,${uuid(secondProfessional)},event_type,starts_at,ends_at,
        service_id,service_name,service_duration_minutes,service_price_cents,customer_id,customer_name,customer_phone
      from public.calendar_events where id=${uuid(booking.event_id)};
      commit; select true as different_professional_allowed;`);
    check('Different professional can attend same unit/time', true);
    const cancelBody = { p_slug: b.slug, p_management_token: booking.management_token, p_reason: null };
    const cancellationRace = await Promise.all([
      publicRpc('cancel_public_booking', cancelBody), publicRpc('cancel_public_booking', cancelBody),
    ]);
    check('Concurrent cancellation: exactly one succeeds', cancellationRace.filter(r => r.status === 204 || r.status === 200).length === 1);
    check('Concurrent cancellation: second sees final state', cancellationRace.filter(r => r.data?.code === 'P0002').length === 1);
    const audit = sql(`select count(*) as total from public.audit_logs where entity_id=${uuid(booking.event_id)} and action='booking.cancelled_by_customer';`)[0];
    check('Concurrent cancellation writes exactly one audit entry', Number(audit.total) === 1);
    const freed = await publicRpc('get_available_slots', { p_slug: b.slug, p_service_id: service, p_date: day });
    check('Cancelled slot free despite other professional booking', freed.status === 200 && freed.data.some(s => new Date(s.starts_at).valueOf() === new Date(`${day}T09:00:00-03:00`).valueOf()));
    if (gatewayMode) {
      const denied = await publicRpc('book_public_appointment_guarded', { ...bookingArgs, p_client_digest: gatewayIp, p_phone_digest: gatewayPhone });
      check('Anonymous cannot forge gateway digests via direct RPC', denied.status === 401 || denied.status === 403);
      const burstIp = randomBytes(32).toString('hex');
      const burstPhone = randomBytes(32).toString('hex');
      rateDigests.push(burstIp, burstPhone);
      const burst = await Promise.all(Array.from({ length: 12 }, () => admin.rpc('book_public_appointment_guarded', {
        ...bookingArgs, p_slug: `missing-${randomUUID()}`, p_client_digest: burstIp, p_phone_digest: burstPhone,
      })));
      check('Atomic quotas: exactly ten concurrent invalid attempts admitted', burst.filter(r => r.data?.error_code === 'P0002').length === 10);
      check('Atomic quotas: remaining concurrent attempts rate limited', burst.filter(r => r.data?.error_code === 'RATE_LIMITED').length === 2);
      const base = process.env.SECURITY_TEST_APP_URL;
      if (base) {
        if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('App flow restricted to local production build');
        // Matches server's explicit local-only test identity; never sent in request JSON.
        rateDigests.push(createHmac('sha256', adminKey).update('booking-ip:local-security-test').digest('hex'));
        rateDigests.push(createHmac('sha256', adminKey).update(`booking-phone:${b.slug}:11900000009`).digest('hex'));
        const call = async (path, body) => {
          const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          return { status: response.status, data: await response.json() };
        };
        const response = await call(`/api/public/${b.slug}/book`, { service_id: service, starts_at: `${day}T09:00:00-03:00`, customer_name: 'App flow fixture', customer_phone: '11900000009' });
        check('App API creates booking through guarded RPC', response.status === 201 && typeof response.data.management_url === 'string');
        const management = response.data.management_url;
        const privatePage = await fetch(`${base}${management}`);
        check('Private management page renders without token cache', privatePage.status === 200 && /no-store/.test(privatePage.headers.get('cache-control')));
        const apiPath = management.replace('/p/', '/api/public/');
        const moved = await call(`${apiPath}/reschedule`, { starts_at: `${day}T10:00:00-03:00` });
        check('App API reschedules token-authorized booking', moved.status === 200);
        const original = await publicRpc('get_available_slots', { p_slug: b.slug, p_service_id: service, p_date: day });
        check('App reschedule releases old slot', original.data.some(s => new Date(s.starts_at).valueOf() === new Date(`${day}T09:00:00-03:00`).valueOf()));
        const cancelled = await call(`${apiPath}/cancel`, { reason: 'Security test cleanup' });
        check('App API cancels token-authorized booking', cancelled.status === 200);
        const released = await publicRpc('get_available_slots', { p_slug: b.slug, p_service_id: service, p_date: day });
        check('App cancellation releases moved slot', released.data.some(s => new Date(s.starts_at).valueOf() === new Date(`${day}T10:00:00-03:00`).valueOf()));
      }
    }
  }
} catch (error) {
  // Never serialize SDK responses, sessions or credentials.
  console.error(error instanceof Error ? error.message : 'Integration test failed');
  process.exitCode = 1;
} finally {
  try {
    if (gatewayMode && rateDigests.length) {
      if (!rateDigests.every(d => /^[a-f0-9]{64}$/.test(d))) throw new Error('Invalid fixture quota digest');
      sql(`delete from public.booking_rate_limits where split_part(bucket,':',2) in (${rateDigests.map(d => `'${d}'`).join(',')}); select true as fixture_quotas_removed;`);
    }
    for (const workspace of workspaces) {
      const org = uuid(workspace.organization_id);
      // Exact generated ID AND unique slug. Never deletes a pre-existing tenant.
      sql(`begin;
        do $$ begin
          if not exists(select 1 from public.organizations where id=${org} and slug='${workspace.slug}') then
            raise exception 'Fixture cleanup identity mismatch';
          end if;
        end $$;
        delete from public.calendar_events where organization_id=${org};
        delete from public.appointment_series where organization_id=${org};
        delete from public.organizations where id=${org} and slug='${workspace.slug}';
        commit; select true as fixture_organization_removed;`);
    }
    for (const user of users) {
      const current = await admin.auth.admin.getUserById(user.id);
      if (current.error || current.data.user?.email !== user.email) throw new Error('Fixture Auth cleanup identity mismatch');
      const removed = await admin.auth.admin.deleteUser(user.id);
      if (removed.error) throw new Error('Fixture Auth cleanup failed');
    }
    console.log(JSON.stringify({ suite: 'security_signed_session', passed: passed.length, tests: passed, fixturesRemoved: true }));
  } catch {
    console.error('Fixture cleanup incomplete. Inspect ONLY these generated IDs:', JSON.stringify({ users: users.map(u => u.id), organizations: workspaces.map(w => w.organization_id) }));
    process.exitCode = 1;
  }
}
