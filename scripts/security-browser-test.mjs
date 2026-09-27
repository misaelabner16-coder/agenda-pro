// Uses the existing Codex Playwright runtime, not an application dependency.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const runtime = process.env.PLAYWRIGHT_MODULE_PATH || 'C:/Users/misael/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const base = process.env.SECURITY_TEST_APP_URL || 'http://localhost:3100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Browser regression is local-build only');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
let expectCspViolation = false;
page.on('pageerror', () => errors.push('pageerror'));
page.on('console', message => { if (message.type() === 'error' && !expectCspViolation) errors.push('console-error'); });
let passed = 0;
function check(name, ok) { assert.equal(Boolean(ok), true, name); passed++; }
try {
  const home = await page.goto(base);
  await page.waitForLoadState('networkidle');
  check('home renders', home.status() === 200 && await page.getByRole('link', { name: 'Entrar', exact: true }).count() > 0);
  const header = home.headers()['content-security-policy'];
  check('CSP nonce served', /'nonce-[^']+'/.test(header));
  check('nosniff served', home.headers()['x-content-type-options'] === 'nosniff');
  check('no referrer leakage', home.headers()['referrer-policy'] === 'no-referrer');
  check('nonced framework scripts', await page.evaluate(() => [...document.scripts].filter(s => s.textContent || s.src).every(s => Boolean(s.nonce))));
  await page.getByRole('link', { name: 'Entrar', exact: true }).first().click();
  await page.waitForURL('**/login');
  await page.waitForLoadState('networkidle');
  check('login renders after client navigation', await page.getByRole('button', { name: 'Entrar', exact: true }).count() === 1);
  const password = page.locator('input[name="password"]');
  await page.getByRole('button', { name: /mostrar senha/i }).click();
  check('hydrated password toggle works with CSP', await password.getAttribute('type') === 'text');
  await page.getByRole('button', { name: /ocultar senha/i }).click();
  check('password toggle restores masking', await password.getAttribute('type') === 'password');
  check('no runtime/CSP errors in normal UI', errors.length === 0);
  await page.screenshot({ path: join(tmpdir(), 'agenda-pro-security-login.png'), fullPage: true });
  const newDocument = await page.goto(`${base}/cadastro`);
  check('nonce differs on subsequent document', header !== newDocument.headers()['content-security-policy']);
  await page.waitForLoadState('networkidle');
  expectCspViolation = true;
  // Inject into the HTML response, not DevTools evaluation (a privileged context).
  // The browser parses this as untrusted markup with the actual server CSP.
  await page.route('**/cadastro', async route => {
    const original = await route.fetch();
    const html = await original.text();
    await route.fulfill({ response: original, body: html.replace('</head>', '<script>window.__securityInjectedScriptRan = true</script></head>') });
  });
  await page.goto(`${base}/cadastro`);
  await page.waitForLoadState('networkidle');
  check('browser blocks an injected inline script', await page.evaluate(() => window.__securityInjectedScriptRan !== true));
  const tokenPath = `${base}/api/public/audit-test/agendamento/${'a'.repeat(64)}/cancel`;
  const nullBody = await page.request.post(tokenPath, { data: 'null', headers: { 'content-type': 'application/json' } });
  check('cancel JSON null returns controlled 400', nullBody.status() === 400);
  check('private response cannot be cached', /no-store/.test(nullBody.headers()['cache-control']));
  check('private response excludes indexing', /noindex/.test(nullBody.headers()['x-robots-tag']));
  const foreign = await page.request.post(tokenPath, { data: {}, headers: { origin: 'https://evil.example' } });
  check('cross-origin browser cancellation rejected', foreign.status() === 403);
  const invalidDate = await page.request.get(`${base}/api/public/audit-test/availability?service_id=${'a'.repeat(8)}-aaaa-aaaa-aaaa-${'a'.repeat(12)}&date=2026-02-30`);
  check('invalid date rejected before database query', invalidDate.status() === 400);
  console.log(JSON.stringify({ suite: 'security_browser', passed, normalRuntimeErrors: errors.length }));
} finally { await browser.close(); }
