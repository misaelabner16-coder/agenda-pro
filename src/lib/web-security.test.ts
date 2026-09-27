import assert from "node:assert/strict";
import test from "node:test";
import { browserSecurityHeaders, passwordValue, readPublicJson, safeInternalPath, validDate, validInstant, validSlug, validToken, validUuid } from "./web-security.ts";
import { priceToCents } from "./format.ts";

test("auth redirect rejects protocol-relative, backslash, controls and malformed URLs", () => {
  for (const value of ["//evil.example", "/\\evil.example", "/%5cevil.example", "/%2fevil.example", "/\nevil.example", "https://evil.example", "javascript:alert(1)", "/%ZZ"]) {
    assert.equal(safeInternalPath(value), "/onboarding", value);
  }
  assert.equal(safeInternalPath("/dashboard/agenda?date=2026-09-26"), "/dashboard/agenda?date=2026-09-26");
});
test("password bytes including leading/trailing spaces are preserved", () => {
  const form = new FormData(); form.set("password", "  secret password  ");
  assert.equal(passwordValue(form), "  secret password  ");
});
const request = (body: string, headers: Record<string, string> = {}) => new Request("https://agenda.example/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
test("public JSON rejects null, arrays, primitives and malformed bodies without TypeError", async () => {
  for (const body of ["null", "[]", "42", '"text"', "{"]) await assert.rejects(readPublicJson(request(body)), { status: 400 });
  assert.deepEqual(await readPublicJson(request("{}")), {});
});
test("public JSON rejects oversized actual body even without Content-Length", async () => {
  await assert.rejects(readPublicJson(request(JSON.stringify({ x: "a".repeat(9000) }))), { status: 413 });
});
test("browser mutation rejects cross-origin and non-JSON input", async () => {
  await assert.rejects(readPublicJson(request("{}", { origin: "https://evil.example" })), { status: 403 });
  await assert.rejects(readPublicJson(request("{}", { "content-type": "text/plain" })), { status: 415 });
  assert.deepEqual(await readPublicJson(request("{}", { origin: "https://agenda.example" })), {});
});
test("public validators reject invalid dates and ambiguous timezone-less timestamps", () => {
  assert.equal(validDate("2026-02-30"), false); assert.equal(validDate("2028-02-29"), true);
  assert.equal(validInstant("2026-09-26T09:00:00"), false);
  assert.equal(validInstant("2026-02-30T09:00:00Z"), false);
  assert.equal(validInstant("2026-09-26T09:00:00-03:00"), true);
  assert.equal(validInstant("infinity"), false);
  assert.equal(validInstant("2026-09-26T24:00:00Z"), false);
  assert.equal(validUuid("not-a-uuid"), false); assert.equal(validToken("a".repeat(63)), false);
  assert.equal(validSlug("../admin"), false);
});
test("invalid or overflowing price is rejected and normal prices remain valid", () => {
  for (const value of ["-1", "Infinity", "invalid", "999999999999999999999"]) assert.throws(() => priceToCents(value));
  assert.equal(priceToCents("25,50"), 2550);
});
test("production CSP blocks inline scripts, eval, framing and third-party forms", () => {
  const headers = browserSecurityHeaders("a".repeat(32), false, "https://nuhxuhkunhuzljjjkzbx.supabase.co");
  const scripts = headers["Content-Security-Policy"].split(";").find(p => p.trim().startsWith("script-src"))!;
  assert.ok(scripts.includes("'nonce-")); assert.ok(scripts.includes("'strict-dynamic'"));
  assert.ok(!scripts.includes("unsafe-inline")); assert.ok(!scripts.includes("unsafe-eval"));
  assert.ok(headers["Content-Security-Policy"].includes("frame-ancestors 'none'"));
  assert.ok(headers["Content-Security-Policy"].includes("form-action 'self'"));
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
});
