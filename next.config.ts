import type { NextConfig } from "next";
import { assertEnvironmentDatabase, validatedSiteOrigin } from "./src/lib/environment-security.ts";

// Fail the build before Vercel can promote a production deployment to the old database.
export function assertProductionSupabaseTarget(environment?: string, url?: string) {
  if (environment === "production" && url?.replace(/\/$/, "") !== "https://nuhxuhkunhuzljjjkzbx.supabase.co") {
    throw new Error("Publicação bloqueada: configure NEXT_PUBLIC_SUPABASE_URL com o projeto Supabase de São Paulo (nuhxuhkunhuzljjjkzbx).");
  }
}

assertProductionSupabaseTarget(process.env.VERCEL_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL);
assertEnvironmentDatabase(process.env.VERCEL_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.ALLOW_PRODUCTION_DATABASE_FOR_TESTS === "1");
validatedSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_ENV === "production");

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
