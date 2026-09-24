import { test } from "node:test";
import assert from "node:assert/strict";
import { assertProductionSupabaseTarget } from "../../next.config.ts";

test("production accepts only the São Paulo Supabase project", () => {
  assert.doesNotThrow(() => assertProductionSupabaseTarget("production", "https://nuhxuhkunhuzljjjkzbx.supabase.co"));
  assert.doesNotThrow(() => assertProductionSupabaseTarget("production", "https://nuhxuhkunhuzljjjkzbx.supabase.co/"));
  assert.throws(() => assertProductionSupabaseTarget("production", "https://tjxhohypuqjnlnbgstvy.supabase.co"), /Publicação bloqueada/);
  assert.throws(() => assertProductionSupabaseTarget("production", undefined), /Publicação bloqueada/);
});

test("local tests are not production deployments", () => {
  assert.doesNotThrow(() => assertProductionSupabaseTarget(undefined, undefined));
});
