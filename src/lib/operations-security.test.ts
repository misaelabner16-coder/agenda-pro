import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertEnvironmentDatabase, validatedSiteOrigin } from "./environment-security.ts";

test("retired Canada database is rejected in every environment", () => {
  for (const env of [undefined, "production", "preview", "development"]) assert.throws(() => assertEnvironmentDatabase(env, "https://tjxhohypuqjnlnbgstvy.supabase.co", true));
});
test("preview cannot share production; local production requires explicit opt-in", () => {
  const prod = "https://nuhxuhkunhuzljjjkzbx.supabase.co";
  assert.throws(() => assertEnvironmentDatabase("preview", prod, true));
  assert.throws(() => assertEnvironmentDatabase(undefined, prod));
  assert.throws(() => assertEnvironmentDatabase("development", prod));
  assert.doesNotThrow(() => assertEnvironmentDatabase(undefined, prod, true));
  assert.doesNotThrow(() => assertEnvironmentDatabase("production", prod));
  assert.doesNotThrow(() => assertEnvironmentDatabase("preview", "https://separatetestproject.supabase.co"));
});
test("email confirmation origin cannot accidentally point to Supabase or unsafe URL", () => {
  for (const value of [undefined, "https://nuhxuhkunhuzljjjkzbx.supabase.co", "javascript:alert(1)", "https://user:pass@example.com", "https://example.com/path", "http://example.com"]) assert.throws(() => validatedSiteOrigin(value, true));
  assert.equal(validatedSiteOrigin("https://agenda-pro-lovat.vercel.app/", true), "https://agenda-pro-lovat.vercel.app");
  assert.equal(validatedSiteOrigin(undefined, false), "http://localhost:3000");
});
test("application logs exclude raw database messages, full errors and private URLs", () => {
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.tsx?$/.test(file) && !file.endsWith(".test.ts")) {
        const source = readFileSync(file,"utf8");
        for (const log of source.matchAll(/console\.(?:log|warn|error)\([\s\S]*?\);/g)) {
          assert.doesNotMatch(log[0], /\.message|\.stack|request\.url|management_token|customer_phone|customer_name|,\s*error\s*\)/, file);
        }
        if (/^["']use client["']/m.test(source)) assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|booking-gateway/, file);
      }
    }
  };
  visit(fileURLToPath(new URL("..", import.meta.url)));
});
