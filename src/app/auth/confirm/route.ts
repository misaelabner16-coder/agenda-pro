import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath, privateResponseHeaders } from "@/lib/web-security";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  const allowedTypes = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
  const { error } = tokenHash && type && allowedTypes.includes(type)
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("Código de confirmação ausente.") };

  if (!error) return NextResponse.redirect(new URL(next, request.url), { headers: privateResponseHeaders });

  console.error("[auth] Falha ao confirmar e-mail.");
  return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent("O link de confirmação é inválido ou expirou. Solicite um novo e-mail.")}`, request.url), { headers: privateResponseHeaders });
}
