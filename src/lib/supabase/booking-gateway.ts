import "server-only";
import { createClient } from "@supabase/supabase-js";
import { bookingClientDigest, bookingPhoneDigest } from "@/lib/booking-abuse";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database";

export function createBookingGateway(headers: Headers, slug: string, phone: string) {
  const secret = process.env.SUPABASE_SECRET_KEY || "";
  if (!secret) throw new Error("Booking server credential missing");
  const clientDigest = bookingClientDigest(headers, secret, process.env.VERCEL === "1",
    process.env.VERCEL !== "1" && process.env.SECURITY_LOCAL_BOOKING_TEST === "1");
  const { url } = getSupabaseConfig();
  // No user cookies/session accepted. This privileged client stays in this server-only module.
  // Call only the narrowly scoped guarded booking RPC, never arbitrary tables or user RPCs.
  return {
    client: createClient<Database>(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
    clientDigest, phoneDigest: bookingPhoneDigest(slug, phone, secret),
  };
}
