import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503 });
  const { slug, token } = await params;
  const body = await request.json().catch(() => ({})) as { reason?: unknown };
  if (!/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({ error: "Link inválido." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_public_booking", { p_slug: slug, p_management_token: token, p_reason: typeof body.reason === "string" ? body.reason.trim() : null });
  if (error?.code === "42501") return NextResponse.json({ error: "O prazo para cancelar este agendamento já passou." }, { status: 403 });
  if (error) return NextResponse.json({ error: "Não foi possível cancelar este agendamento." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
