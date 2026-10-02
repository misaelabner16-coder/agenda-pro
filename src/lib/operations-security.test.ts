import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertEnvironmentDatabase, validatedSiteOrigin, canonicalAuthDestination } from "./environment-security.ts";

test("domain transition canonicalizes auth entry only, preserving PKCE callbacks and local/preview", () => {
  const origin = "https://www.ammaligestao.com";
  assert.equal(canonicalAuthDestination("https://agenda-pro-lovat.vercel.app/recuperar-senha?next=https://evil.example", origin, "production"), `${origin}/recuperar-senha`);
  assert.equal(canonicalAuthDestination(`${origin}/login`, origin, "production"), null);
  for (const path of ["/auth/confirm?code=private", "/redefinir-senha", "/p/barbearia-misael"]) {
    assert.equal(canonicalAuthDestination(`https://agenda-pro-lovat.vercel.app${path}`, origin, "production"), null);
  }
  assert.equal(canonicalAuthDestination("http://localhost:3102/login", origin, "production"), null);
  assert.equal(canonicalAuthDestination("https://preview.vercel.app/login", origin, "preview"), null);
  assert.equal(canonicalAuthDestination("https://agenda-pro-lovat.vercel.app/login", "https://evil.example", "production"), null);
});

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
  assert.doesNotThrow(() => assertEnvironmentDatabase("preview", "https://dbtxikkhzmqstuiudxko.supabase.co"));
  assert.throws(() => assertEnvironmentDatabase("preview", "https://separatetestproject.supabase.co"));
  assert.throws(() => assertEnvironmentDatabase("preview", undefined));
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
