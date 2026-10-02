import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTestExecution, testAppOrigin, PREVIEW_ORIGIN, TEST_PROJECT_REF } from './test-environment.mjs';

test('only isolated fixture target and explicit test flag are accepted', () => {
  assert.equal(TEST_PROJECT_REF, 'dbtxikkhzmqstuiudxko');
  assert.doesNotThrow(() => assertTestExecution(['--confirm-test-fixtures']));
  for (const args of [[], ['--production-smoke', '--confirm-test-fixtures'], ['--confirm-sao-paulo-fixtures']]) {
    assert.throws(() => assertTestExecution(args));
  }
});
test('reject production, disguised remote origins and token-bearing URLs', () => {
  assert.equal(testAppOrigin('http://localhost:3102/'), 'http://localhost:3102');
  assert.equal(testAppOrigin(PREVIEW_ORIGIN), PREVIEW_ORIGIN);
  for (const value of [
    'https://www.ammaligestao.com', 'https://agenda-pro-lovat.vercel.app',
    PREVIEW_ORIGIN + '.evil.example', 'http://localhost.evil.example:3102',
    'http://user:secret@localhost:3102', PREVIEW_ORIGIN + '?token=secret',
    PREVIEW_ORIGIN + '/login', 'ftp://localhost:3102',
  ]) assert.throws(() => testAppOrigin(value), value);
});
