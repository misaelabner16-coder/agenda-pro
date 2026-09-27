import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PublicInputError, readPublicJson, validSlug, validToken, privateResponseHeaders } from "@/lib/web-security";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503 });
  const { slug, token } = await params;
  let body: Record<string, unknown>;
  try { body = await readPublicJson(request); }
  catch (error) { return NextResponse.json({ error: "Dados inválidos." }, { status: error instanceof PublicInputError ? error.status : 400, headers: privateResponseHeaders }); }
  if (!validSlug(slug) || !validToken(token) || (body.reason != null && (typeof body.reason !== "string" || body.reason.length > 500))) return NextResponse.json({ error: "Link ou motivo inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_public_booking", { p_slug: slug, p_management_token: token, p_reason: typeof body.reason === "string" ? body.reason.trim() : null });
  if (error?.code === "42501") return NextResponse.json({ error: "O prazo para cancelar este agendamento já passou." }, { status: 403 });
  if (error?.code === "P0002") return NextResponse.json({ error: "Agendamento não encontrado ou já cancelado." }, { status: 404 });
  if (error?.code === "22023") return NextResponse.json({ error: "Revise o motivo informado." }, { status: 400 });
  if (error) {
    console.error("[booking-cancel] Falha ao cancelar agendamento.", { code: error.code });
    return NextResponse.json({ error: "Não foi possível cancelar este agendamento agora." }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { headers: privateResponseHeaders });
}
