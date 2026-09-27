import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath, privateResponseHeaders } from "@/lib/web-security";
import { expiredRecoveryMessage } from "@/lib/password-recovery";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const recovery = type === "recovery" || next === "/redefinir-senha";
  const supabase = await createSupabaseServerClient();

  const allowedTypes = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];
  let error: unknown;
  try {
    ({ error } = tokenHash && type && allowedTypes.includes(type)
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("Código de confirmação ausente.") });
  } catch { error = true; }

  if (!error) return NextResponse.redirect(new URL(recovery ? "/redefinir-senha" : next, request.url), { headers: privateResponseHeaders });

  console.error("[auth] Falha ao confirmar e-mail.");
  if (recovery) return NextResponse.redirect(new URL(`/recuperar-senha?erro=${encodeURIComponent(expiredRecoveryMessage)}`, request.url), { headers: privateResponseHeaders });
  return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent("O link de confirmação é inválido ou expirou. Solicite um novo e-mail.")}`, request.url), { headers: privateResponseHeaders });
}
