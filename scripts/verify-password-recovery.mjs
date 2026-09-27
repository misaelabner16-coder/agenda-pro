// Explicit São Paulo-only fixture. Never loads .env.local or prints credentials.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

if (!process.argv.includes('--confirm-sao-paulo-fixture')) throw Error('Explicit fixture approval required');
const project = 'nuhxuhkunhuzljjjkzbx';
const url = `https://${project}.supabase.co`;
const cli = process.env.SUPABASE_CLI_PATH || 'C:/Users/misael/AppData/Local/Temp/agenda-pro-supabase-cli-3771594b-4ce3-463b-814b-7c04b50499fb/supabase.exe';
let keys;
try {
  const raw = execFileSync(cli, ['projects', 'api-keys', '--project-ref', project, '--output', 'json'], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
  keys = JSON.parse(raw.slice(raw.search(/[\[{]/)));
} catch { throw Error('Could not obtain fixture credentials; raw output suppressed'); }
const publicKey = keys.find(k => k.type === 'publishable')?.api_key || keys.find(k => k.name === 'anon')?.api_key;
const secretKey = keys.find(k => k.name === 'service_role')?.api_key;
if (!publicKey || !secretKey) throw Error('Fixture credentials missing');
const production = process.argv.includes('--production-smoke');
const base = production ? 'https://agenda-pro-lovat.vercel.app' : 'http://localhost:3102';
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1', NEXT_TELEMETRY_DISABLED: '1', VERCEL_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
  NEXT_PUBLIC_SITE_URL: 'https://agenda-pro-lovat.vercel.app' };
if (!production && process.argv.includes('--build')) {
  execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env, stdio: 'inherit', timeout: 300000 });
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, options);
const normal = () => createClient(url, publicKey, options);
let server, browser, fixtureId;
const passed = [];
const check = (name, ok) => { assert.equal(Boolean(ok), true, name); passed.push(name); };
try {
  if (!production) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', '3102'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    // Consume logs without forwarding request URLs (they may contain recovery tokens).
    server.stdout.resume(); server.stderr.resume();
    for (let n = 0; n < 60; n++) {
      try { if ((await fetch(`${base}/login`)).ok) break; } catch { /* booting */ }
      if (n === 59) throw Error('Local production server did not start');
      await new Promise(r => setTimeout(r, 500));
    }
  }
  const runtime = process.env.PLAYWRIGHT_MODULE_PATH || 'C:/Users/misael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(pathToFileURL(runtime).href);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', () => errors.push('runtime'));
  await page.goto(`${base}/login`);
  check('Ammali branding', (await page.title()).includes('Ammali'));
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.waitForURL('**/recuperar-senha');
  check('Recovery form reachable on mobile', await page.getByRole('button', { name: 'Enviar link de recuperação' }).count() === 1);
  check('Mobile page has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: join(tmpdir(), 'ammali-recovery-mobile.png'), fullPage: true });
  const unauth = await page.goto(`${base}/redefinir-senha`);
  check('Unauthenticated reset denied', new URL(page.url()).pathname === '/recuperar-senha');
  check('Recovery page is not cacheable', unauth.headers()['cache-control'].includes('no-store'));
  await page.goto(`${base}/auth/confirm?type=recovery&token_hash=invalid`);
  await page.waitForURL('**/recuperar-senha?erro=*');
  await page.locator('p[role="alert"]').waitFor();
  check('Invalid recovery link safely rejected', new URL(page.url()).pathname === '/recuperar-senha' && await page.locator('p[role="alert"]').count() === 1);

  const email = `ammali-recovery-${randomUUID()}@example.invalid`;
  const oldPassword = randomBytes(32).toString('base64url');
  const newPassword = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
  if (created.error || !created.data.user) throw Error('Could not create unique Auth fixture');
  fixtureId = created.data.user.id;
  const existingSession = await normal().auth.signInWithPassword({ email, password: oldPassword });
  check('Fixture old password initially works', !existingSession.error && Boolean(existingSession.data.session));
  // Generate, do not send: this validates Auth/callback/UI without consuming SMTP quota.
  const link = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (link.error || !link.data.properties?.hashed_token) throw Error('Could not generate fixture recovery link');
  const recoveryUrl = `${base}/auth/confirm?type=recovery&token_hash=${encodeURIComponent(link.data.properties.hashed_token)}`;
  await page.goto(recoveryUrl);
  await page.waitForURL('**/redefinir-senha');
  await page.getByRole('heading', { name: 'Crie uma nova senha' }).waitFor();
  check('Real recovery token establishes server session', await page.getByRole('heading', { name: 'Crie uma nova senha' }).count() === 1);
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="password_confirmation"]').fill('Different password!');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await page.locator('p[role="alert"]').waitFor();
  check('Server rejects mismatched confirmation', (await page.locator('p[role="alert"]').textContent()).includes('não coincidem'));
  await page.locator('input[name="password"]').fill(newPassword);
  await page.locator('input[name="password_confirmation"]').fill(newPassword);
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await page.waitForURL('**/login?mensagem=*');
  check('Successful reset returns to login', new URL(page.url()).pathname === '/login');
  check('Old password is rejected', Boolean((await normal().auth.signInWithPassword({ email, password: oldPassword })).error));
  check('New password works', !(await normal().auth.signInWithPassword({ email, password: newPassword })).error);
  const refresh = await normal().auth.refreshSession({ refresh_token: existingSession.data.session.refresh_token });
  check('Prior refresh session revoked', Boolean(refresh.error));
  await page.goto(recoveryUrl);
  await page.waitForURL('**/recuperar-senha?erro=*');
  check('Consumed recovery link cannot be reused', new URL(page.url()).pathname === '/recuperar-senha');
  check('No browser runtime errors', errors.length === 0);
  console.log(JSON.stringify({ suite: 'ammali_password_recovery', production, passed: passed.length, checks: passed, smtpDelivery: 'manual validation still required' }));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (fixtureId) {
    const deleted = await admin.auth.admin.deleteUser(fixtureId);
    if (deleted.error) throw Error('Fixture cleanup failed; only this run fixture requires cleanup');
    console.log('Temporary Auth fixture removed; existing users untouched.');
  }
}
