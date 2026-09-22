import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding";
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error("Código de confirmação ausente.") };

  if (!error) return NextResponse.redirect(new URL(next, request.url));

  console.error("[auth] Falha ao confirmar e-mail.", { message: error.message });
  return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent("O link de confirmação é inválido ou expirou. Solicite um novo e-mail.")}`, request.url));
}
