// Explicit remote integration test. Never loads .env.local (the legacy project).
// Privileged credentials are used ONLY to provision/clean this run's fixtures.
// Every authorization assertion goes through HTTP with a normal signed user JWT.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
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
} catch (error) {
  // Never serialize SDK responses, sessions or credentials.
  console.error(error instanceof Error ? error.message : 'Integration test failed');
  process.exitCode = 1;
} finally {
  try {
    for (const workspace of workspaces) {
      const org = uuid(workspace.organization_id);
      // Exact generated ID AND unique slug. Never deletes a pre-existing tenant.
      sql(`begin;
        do $$ begin
          if not exists(select 1 from public.organizations where id=${org} and slug='${workspace.slug}') then
            raise exception 'Fixture cleanup identity mismatch';
          end if;
        end $$;
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
