export const TEST_PROJECT_REF = 'dbtxikkhzmqstuiudxko';
export const TEST_DATABASE_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
export const PREVIEW_ORIGIN = 'https://agenda-pro-git-codex-staging-misaelabner16-8780.vercel.app';

export function testAppOrigin(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || (!loopback && url.origin !== PREVIEW_ORIGIN)
      || (loopback && url.protocol !== 'http:')) {
    throw new Error('Testes permitidos somente no app local ou no Preview Ammali Testes.');
  }
  return url.origin;
}

export function assertTestExecution(args = process.argv) {
  if (args.includes('--production-smoke') || args.some(arg => arg.startsWith('--confirm-sao-paulo'))) {
    throw new Error('Teste em produção bloqueado. Use --confirm-test-fixtures no Ammali Testes.');
  }
  if (!args.includes('--confirm-test-fixtures')) {
    throw new Error('Use --confirm-test-fixtures para criar e remover registros exclusivos de teste.');
  }
}
