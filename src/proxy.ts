import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database";
import { browserSecurityHeaders, privateResponseHeaders } from "@/lib/web-security";
import { canonicalAuthDestination } from "@/lib/environment-security";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const securityHeaders = browserSecurityHeaders(nonce, process.env.NODE_ENV === "development", url);
  function nextResponse() {
    const headers = new Headers(request.headers);
    // Overwrite user-supplied nonce/CSP. Next.js uses this to nonce its scripts.
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", securityHeaders["Content-Security-Policy"]);
    return NextResponse.next({ request: { headers } });
  }
  let response = nextResponse();
  function secureResponse() {
    for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
    if (/^\/(api|auth|dashboard|admin|recuperar-senha|redefinir-senha)(\/|$)/.test(request.nextUrl.pathname) || request.nextUrl.pathname.includes("/agendamento/")) {
      for (const [name, value] of Object.entries(privateResponseHeaders)) response.headers.set(name, value);
    }
    return response;
  }
  const canonical = request.method === "GET"
    ? canonicalAuthDestination(request.url, process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_ENV)
    : null;
  if (canonical) {
    response = NextResponse.redirect(canonical, 307);
    response.headers.set("Cache-Control", "private, no-store");
    return secureResponse();
  }
  if (!url || !key) return secureResponse();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims validates the JWT and refreshes the cookie when necessary.
  // Keep this call immediately after creating the client, as recommended by
  // @supabase/ssr, so the browser and Server Components stay in sync.
  await supabase.auth.getClaims();
  return secureResponse();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
