import type { NextConfig } from "next";

// Fail the build before Vercel can promote a production deployment to the old database.
export function assertProductionSupabaseTarget(environment?: string, url?: string) {
  if (environment === "production" && url?.replace(/\/$/, "") !== "https://nuhxuhkunhuzljjjkzbx.supabase.co") {
    throw new Error("Publicação bloqueada: configure NEXT_PUBLIC_SUPABASE_URL com o projeto Supabase de São Paulo (nuhxuhkunhuzljjjkzbx).");
  }
}

assertProductionSupabaseTarget(process.env.VERCEL_ENV, process.env.NEXT_PUBLIC_SUPABASE_URL);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
