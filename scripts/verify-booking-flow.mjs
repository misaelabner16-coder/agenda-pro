// Exercises real UI/Auth/API/database boundaries using isolated test fixtures.
// No credentials, passwords, verification tokens, or management URLs are logged.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertTestExecution, testAppOrigin, TEST_PROJECT_REF, TEST_DATABASE_URL } from './test-environment.mjs';

assertTestExecution();
const base = testAppOrigin(process.env.SECURITY_TEST_APP_URL || 'http://localhost:3000');
if (new URL(base).hostname !== 'localhost') throw Error('This runner starts its own local test app. Use localhost.');
const mailbox = process.env.SECURITY_TEST_EMAIL;
if (!mailbox || !/^[a-zA-Z0-9._+-]+@gmail\.com$/.test(mailbox)) throw Error('Provide the explicitly approved Gmail test mailbox.');
const run = randomUUID();
const email = mailbox.replace('@', `+ammali-e2e-${run.slice(0, 8)}@`);
const slug = `e2e-${run}`;
const password = randomBytes(32).toString('base64url') + '!aA9';
const cli = process.env.SUPABASE_CLI_PATH || 'C:/Users/misael/AppData/Local/Temp/agenda-pro-supabase-cli-3771594b-4ce3-463b-814b-7c04b50499fb/supabase.exe';
function cliJson(args) {
  try {
    const raw = execFileSync(cli, args, { encoding: 'utf8', timeout: 60000, windowsHide: true,
      env: { ...process.env, NODE_USE_SYSTEM_CA: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(raw.slice(raw.indexOf('{') >= 0 && raw.indexOf('{') < raw.indexOf('[') ? raw.indexOf('{') : raw.search(/[\[{]/), raw.lastIndexOf('}') > raw.lastIndexOf(']') ? raw.lastIndexOf('}') + 1 : raw.lastIndexOf(']') + 1));
  } catch { throw Error('CLI query failed; output suppressed to protect test credentials.'); }
}
const sql = query => cliJson(['db', 'query', '--linked', '--project-ref', TEST_PROJECT_REF, query]).rows;
const productionFixtureExists = () => cliJson(['db', 'query', '--linked', '--project-ref', 'nuhxuhkunhuzljjjkzbx',
  `select exists(select 1 from auth.users where email='${email}') or exists(select 1 from public.locations where public_slug='${slug}') as fixture_exists`]).rows[0].fixture_exists;
const keys = cliJson(['projects', 'api-keys', '--project-ref', TEST_PROJECT_REF, '--output', 'json']);
const publicKey = keys.find(k => k.type === 'publishable')?.api_key || keys.find(k => k.name === 'anon')?.api_key;
const secretKey = keys.find(k => k.name === 'service_role')?.api_key;
if (!publicKey || !secretKey) throw Error('Test project credentials unavailable.');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(TEST_DATABASE_URL, secretKey, options);
const normal = createClient(TEST_DATABASE_URL, publicKey, options);
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1', NEXT_TELEMETRY_DISABLED: '1', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: TEST_DATABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_SECRET_KEY: secretKey, NEXT_PUBLIC_SITE_URL: base, SECURITY_LOCAL_BOOKING_TEST: '1' };
const passed = [];
const check = (name, ok) => { assert.equal(Boolean(ok), true, name); passed.push(name); console.log('PASS ' + name); };
const safeUuid = id => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('Invalid fixture ID');
  return `'${id}'`;
};
const artifactDir = process.env.SECURITY_TEST_ARTIFACT_DIR;
let server, browser, userId, organizationId, diagnosticPage;
let phase = 'build';
try {
  check('No run fixture exists in production before tests', !productionFixtureExists());
  // Reuse only the already verified test build when explicitly requested.
  // Refuse a stale production bundle before starting a server or making fixtures.
  if (process.argv.includes('--reuse-test-build')) {
    const chunks = readdirSync('.next/server/chunks', { recursive: true }).filter(name => name.endsWith('.js'))
      .map(name => readFileSync('.next/server/chunks/' + name, 'utf8'));
    const buildTime = statSync('.next/BUILD_ID').mtimeMs;
    const changedSource = readdirSync('src', { recursive: true }).filter(name => /\.tsx?$/.test(name))
      .some(name => statSync('src/' + name).mtimeMs > buildTime);
    if (changedSource || !chunks.some(chunk => chunk.includes('get_public_slot_states'))
        || !chunks.some(chunk => chunk.includes(TEST_PROJECT_REF))) throw Error('Existing build is not the current test build.');
  } else {
    const building = execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
      env, encoding: 'utf8', timeout: 300000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    check('App builds with test database and Preview guard', building.includes('Route') || building.includes('Compiled'));
  }
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', new URL(base).port || '80'], {
    env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.resume(); server.stderr.resume();
  server.on('error', () => { process.exitCode = 1; });
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error('Test app exited during startup.');
    try { if ((await fetch(base)).ok) break; } catch { /* waiting for startup */ }
    if (i === 59) throw Error('Test app did not become ready.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const runtime = process.env.PLAYWRIGHT_MODULE_PATH || 'C:/Users/misael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(pathToFileURL(runtime).href);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const owner = await ownerContext.newPage();
  diagnosticPage = owner;
  const errors = [];
  owner.on('pageerror', () => errors.push('owner-runtime'));
  const home = await owner.goto(base);
  check('Home renders and uses isolated test database in CSP', home.status() === 200
    && home.headers()['content-security-policy'].includes(TEST_PROJECT_REF)
    && !home.headers()['content-security-policy'].includes('nuhxuhkunhuzljjjkzbx')
    && await owner.getByRole('link', { name: 'Entrar', exact: true }).count() > 0);
  check('Mobile home does not overflow', await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await owner.goto(base + '/cadastro');
  await owner.locator('input[name="email"]').fill(email);
  await owner.locator('input[name="password"]').fill(password);
  await owner.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await owner.waitForURL('**/login?confirmacao=1**', { timeout: 30000 });
  check('UI signup reaches pending email confirmation', new URL(owner.url()).searchParams.get('confirmacao') === '1');
  const fixture = sql(`select id, confirmation_token, email_confirmed_at from auth.users where email='${email}'`)[0];
  if (!fixture) throw Error('Signup did not create the isolated Auth fixture.');
  userId = fixture.id;
  check('Unconfirmed account cannot sign in', Boolean((await normal.auth.signInWithPassword({ email, password })).error));
  if (!fixture.confirmation_token) throw Error('Email confirmation token unavailable for test fixture.');
  // This is the actual verification token created by the UI signup, not a
  // replacement token or an admin-confirmed account. Keep it private in memory.
  const verify = new URL('/auth/v1/verify', TEST_DATABASE_URL);
  verify.searchParams.set('token', fixture.confirmation_token);
  verify.searchParams.set('type', 'signup');
  verify.searchParams.set('redirect_to', base + '/auth/confirm?next=/onboarding');
  await owner.goto(verify.href);
  await owner.waitForURL('**/onboarding', { timeout: 30000 });
  check('Actual signup token and PKCE callback reach onboarding', await owner.getByRole('button', { name: 'Criar minha agenda', exact: true }).count() === 1);
  await owner.locator('input[name="name"]').fill('Agenda de testes E2E');
  await owner.locator('input[name="slug"]').fill(slug);
  await owner.getByRole('button', { name: 'Criar minha agenda', exact: true }).click();
  await owner.waitForURL('**/dashboard', { timeout: 30000 });
  const location = sql(`select id, organization_id, default_professional_id from public.locations where public_slug='${slug}'`)[0];
  if (!location) throw Error('Onboarding did not create fixture workspace.');
  organizationId = location.organization_id;
  check('UI onboarding creates organization, location and professional', Boolean(location.default_professional_id));
  const login = await normal.auth.signInWithPassword({ email, password });
  check('Confirmed account signs in successfully', !login.error && Boolean(login.data.session));
  await ownerContext.clearCookies();
  await owner.goto(base + '/login');
  await owner.locator('input[name="email"]').first().fill(email);
  await owner.locator('input[name="password"]').fill(password);
  await owner.getByRole('button', { name: 'Entrar', exact: true }).click();
  await owner.waitForURL('**/dashboard', { timeout: 30000 });
  check('UI login returns owner to their dashboard', new URL(owner.url()).pathname === '/dashboard');

  phase = 'create-service';
  await owner.goto(base + '/dashboard/servicos');
  await owner.locator('input[name="name"]').fill('Atendimento E2E');
  await owner.locator('select[name="duration"]').selectOption('60');
  await owner.locator('input[name="price"]').fill('100,00');
  await owner.getByRole('button', { name: 'Adicionar serviço', exact: true }).click();
  await owner.getByRole('heading', { name: 'Atendimento E2E', exact: true }).waitFor();
  const service = sql(`select id from public.services where organization_id=${safeUuid(organizationId)} and name='Atendimento E2E'`)[0];
  check('UI service creation reaches database', Boolean(service?.id));
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const weekDay = new Date(date + 'T12:00:00Z').getUTCDay();
  phase = 'save-hours';
  await owner.goto(base + '/dashboard/horarios');
  const section = owner.locator('form section').nth(weekDay);
  if (await section.locator('input[type="time"]').count() === 0) await section.getByRole('button', { name: '+ Período', exact: true }).click();
  await section.locator('input[type="time"]').nth(0).fill('09:00');
  await section.locator('input[type="time"]').nth(1).fill('12:00');
  await owner.getByRole('button', { name: 'Salvar horários', exact: true }).click();
  await owner.getByRole('status').filter({ hasText: 'Horários salvos com sucesso.' }).waitFor();
  const savedHours = sql(`select start_time, end_time from public.location_hours where location_id=${safeUuid(location.id)} and week_day=${weekDay}`);
  check('UI business hours save successfully', savedHours.some(h => h.start_time === '09:00:00' && h.end_time === '12:00:00'));

  const customerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const customer = await customerContext.newPage();
  phase = 'public-booking';
  diagnosticPage = customer;
  customer.on('pageerror', () => errors.push('customer-runtime'));
  await customer.goto(base + '/p/' + slug);
  await customer.getByRole('button', { name: 'Continuar →', exact: true }).click();
  await customer.locator('input[type="date"]').fill(date);
  await customer.getByRole('button', { name: '09:00 — Livre', exact: true }).waitFor();
  const initial = await customer.request.get(`${base}/api/public/${slug}/availability?service_id=${service.id}&date=${date}`);
  const initialData = await initial.json();
  check('API offers only full-service candidates within business hours', initial.status() === 200
    && initialData.slot_states.length === 9 && initialData.slots.length === 9);
  await customer.getByRole('button', { name: '09:00 — Livre', exact: true }).click();
  await customer.getByRole('button', { name: 'Continuar →', exact: true }).click();
  const customerName = 'Cliente E2E ' + run.slice(0, 8);
  await customer.locator('input[name="name"]').fill(customerName);
  await customer.locator('input[name="phone"]').fill('11900000009');
  await customer.getByRole('button', { name: 'Confirmar agendamento', exact: true }).click();
  await customer.getByRole('heading', { name: 'Agendamento confirmado!', exact: true }).waitFor({ timeout: 30000 });
  const managementUrl = await customer.getByLabel('Link privado para gerenciar seu agendamento').inputValue();
  check('Customer UI confirms booking and provides private management link', managementUrl.startsWith(base + '/p/' + slug + '/agendamento/'));
  const booking = sql(`select id, status from public.calendar_events where organization_id=${safeUuid(organizationId)} and customer_name='${customerName}'`)[0];
  check('Reservation is persisted as confirmed', booking?.status === 'confirmed');
  await owner.goto(base + '/dashboard/agenda?date=' + date);
  await owner.getByText(customerName, { exact: true }).waitFor();
  check('Owner dashboard shows the public reservation', true);

  await customer.goto(base + '/p/' + slug);
  await customer.getByRole('button', { name: 'Continuar →', exact: true }).click();
  await customer.locator('input[type="date"]').fill(date);
  const occupied = customer.getByRole('button', { name: '09:00 — Ocupado', exact: true });
  await occupied.waitFor();
  check('Reserved time remains visible and disabled', await occupied.isDisabled());
  check('All service starts crossing reservation are disabled', await customer.getByRole('button', { name: /Ocupado$/ }).count() === 4);
  check('Adjacent non-overlapping time stays selectable', await customer.getByRole('button', { name: '10:00 — Livre', exact: true }).isEnabled());
  check('Mobile schedule has no horizontal overflow', await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const occupiedData = await (await customer.request.get(`${base}/api/public/${slug}/availability?service_id=${service.id}&date=${date}`)).json();
  check('Public availability exposes only time and status, never customer or token data',
    occupiedData.slot_states.every(s => Object.keys(s).sort().join(',') === 'starts_at,status')
    && !JSON.stringify(occupiedData).includes(customerName));
  const duplicate = await customer.request.post(base + '/api/public/' + slug + '/book', { data: {
    service_id: service.id, starts_at: `${date}T09:00:00-03:00`, customer_name: 'Duplicate E2E', customer_phone: '11900000010',
  } });
  check('Backend rejects booking an occupied time', duplicate.status() === 409);
  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true });
    await customer.screenshot({ path: artifactDir + '/public-occupied-mobile.png', fullPage: true });
  }

  await customer.goto(managementUrl);
  await customer.getByRole('button', { name: 'Cancelar agendamento', exact: true }).click();
  await customer.getByText('Este agendamento foi cancelado. O horário foi liberado.', { exact: true }).waitFor();
  check('Customer private-link cancellation completes', true);
  check('Cancellation persists in database', sql(`select status from public.calendar_events where id=${safeUuid(booking.id)}`)[0]?.status === 'cancelled');
  await customer.goto(base + '/p/' + slug);
  await customer.getByRole('button', { name: 'Continuar →', exact: true }).click();
  await customer.locator('input[type="date"]').fill(date);
  await customer.getByRole('button', { name: '09:00 — Livre', exact: true }).waitFor();
  check('Cancelled time becomes visible and selectable again', await customer.getByRole('button', { name: '09:00 — Livre', exact: true }).isEnabled());
  await owner.goto(base + '/dashboard/agenda?date=' + date);
  await owner.getByText('Cancelado', { exact: true }).waitFor();
  check('Owner dashboard reflects cancellation', true);
  check('No browser runtime errors during full flow', errors.length === 0);
  check('No Auth or calendar fixture was created in production', !productionFixtureExists());
} catch (error) {
  console.error('Booking flow failed during ' + phase + ': ' + (error instanceof assert.AssertionError ? error.message : error?.name || 'Error'));
  if (diagnosticPage && phase !== 'build') {
    const body = await diagnosticPage.locator('body').innerText().catch(() => '');
    console.error('UI evidence: ' + body.slice(0, 2400).replaceAll(email, '[test email]'));
  }
  // Sanitize details: Playwright errors may embed private callback URLs.
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  try {
    if (organizationId) {
      const org = safeUuid(organizationId);
      sql(`begin;
        do $$ begin
          if not exists(select 1 from public.locations where organization_id=${org} and public_slug='${slug}') then
            raise exception 'Cleanup fixture mismatch';
          end if;
        end $$;
        delete from public.calendar_events where organization_id=${org};
        delete from public.appointment_series where organization_id=${org};
        delete from public.organizations where id=${org};
        commit; select true as cleaned;`);
    }
    if (userId) {
      const current = await admin.auth.admin.getUserById(userId);
      if (current.data.user?.email !== email) throw Error('Cleanup user mismatch');
      const result = await admin.auth.admin.deleteUser(userId);
      if (result.error) throw Error('Auth cleanup failed');
    }
    const digests = [
      createHmac('sha256', secretKey).update('booking-ip:local-security-test').digest('hex'),
      ...['11900000009', '11900000010'].map(phone => createHmac('sha256', secretKey).update(`booking-phone:${slug}:${phone}`).digest('hex')),
    ];
    sql(`delete from public.booking_rate_limits where split_part(bucket,':',2) in (${digests.map(d => `'${d}'`).join(',')}); select true as quotas_cleaned;`);
    console.log(JSON.stringify({ suite: 'booking_ui_end_to_end', passed: passed.length, checks: passed, fixturesRemoved: true,
      emailDelivery: 'signup-request-accepted; inbox confirmation requires recipient' }));
  } catch {
    console.error('Cleanup incomplete; inspect generated fixture IDs only: ' + JSON.stringify({ userId, organizationId }));
    process.exitCode = 1;
  }
}
