import { assertEnvironmentDatabase } from "@/lib/environment-security";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  // Build-time guard lives in next.config; recheck server runtime configuration too.
  if (typeof window === "undefined") assertEnvironmentDatabase(process.env.VERCEL_ENV, url, process.env.ALLOW_PRODUCTION_DATABASE_FOR_TESTS === "1");
  return { url, key };
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}
