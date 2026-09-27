import assert from "node:assert/strict";
import test from "node:test";
import { changeRecoveredPassword, recoveryMessage, requestRecovery } from "./password-recovery.ts";

const form = (password = "  New strong password!  ", confirmation = password) => {
  const data = new FormData(); data.set("password", password); data.set("password_confirmation", confirmation);
  data.set("user_id", "someone-else"); return data;
};

test("recovery does not disclose whether email exists, provider errors, or network failures", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const code of [undefined, "user_not_found", "over_email_send_rate_limit", "unexpected_failure"]) {
    const result = await requestRecovery({ resetPasswordForEmail: async () => ({ error: code ? { code } : null }) }, "person@example.com", "https://www.ammaligestao.com");
    assert.deepEqual(result, { message: recoveryMessage });
  }
  assert.deepEqual(await requestRecovery({ resetPasswordForEmail: async () => { throw Error("private provider data"); } }, "person@example.com", "https://www.ammaligestao.com"), { message: recoveryMessage });
});

test("recovery validates email and uses the configured canonical callback", async () => {
  let calls = 0;
  const auth = { resetPasswordForEmail: async (email: string, options: { redirectTo: string }) => {
    calls++; assert.equal(email, "person@example.com");
    assert.equal(options.redirectTo, "https://www.ammaligestao.com/auth/confirm?next=/redefinir-senha");
    return { error: null };
  } };
  assert.ok((await requestRecovery(auth, "invalid", "https://www.ammaligestao.com")).error);
  assert.equal(calls, 0);
  await requestRecovery(auth, "person@example.com", "https://www.ammaligestao.com");
  assert.equal(calls, 1);
});

test("password reset refuses unauthenticated and revoked sessions before updating", async () => {
  for (const error of [null, { code: "session_not_found" }]) {
    let updated = false;
    const result = await changeRecoveredPassword({
      getUser: async () => ({ data: { user: error ? { id: "stale" } : null }, error }),
      updateUser: async () => { updated = true; return { error: null }; },
      signOut: async () => ({ error: null }),
    }, form());
    assert.equal(result.expired, true); assert.equal(updated, false);
  }
});

test("password reset rejects mismatches/short/oversized passwords before any Auth call", async () => {
  const forbidden = async () => { throw Error("Auth must not be called"); };
  for (const data of [form("short"), form("a".repeat(1025)), form("strong password", "different")]) {
    const result = await changeRecoveredPassword({ getUser: forbidden, updateUser: forbidden, signOut: forbidden }, data);
    assert.ok(result.error);
  }
});

test("password reset preserves spaces, ignores client user IDs and revokes refresh sessions", async () => {
  const calls: string[] = [];
  const result = await changeRecoveredPassword({
    getUser: async () => { calls.push("verify"); return { data: { user: { id: "current-user" } }, error: null }; },
    updateUser: async (attributes) => { calls.push("update"); assert.deepEqual(attributes, { password: "  New strong password!  " }); return { error: null }; },
    signOut: async (options) => { calls.push("signOut"); assert.deepEqual(options, { scope: "global" }); return { error: null }; },
  }, form());
  assert.deepEqual(result, { success: true }); assert.deepEqual(calls, ["verify", "update", "signOut"]);
});

test("reset errors do not expose raw provider information or report success", async (t) => {
  const logged: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logged.push(args));
  for (const code of ["same_password", "weak_password", "reauthentication_needed"]) {
    const result = await changeRecoveredPassword({
      getUser: async () => ({ data: { user: { id: "current" } }, error: null }),
      updateUser: async () => ({ error: { code, message: "SECRET" } }),
      signOut: async () => { throw Error("must not sign out on failed update"); },
    }, form());
    assert.ok(result.error); assert.equal(result.success, undefined);
  }
  assert.ok(!JSON.stringify(logged).includes("SECRET"));
});
