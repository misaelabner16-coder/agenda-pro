import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503 });
  const { slug, token } = await params;
  const body = await request.json().catch(() => null) as { starts_at?: unknown } | null;
  const startsAt = typeof body?.starts_at === "string" ? body.starts_at : "";
  if (!/^[a-f0-9]{64}$/i.test(token) || Number.isNaN(new Date(startsAt).valueOf())) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_public_booking", { p_slug: slug, p_management_token: token, p_new_starts_at: startsAt });
  if (error?.code === "23P01") return NextResponse.json({ error: "Esse horário acabou de ficar indisponível. Escolha outro." }, { status: 409 });
  if (error?.code === "42501") return NextResponse.json({ error: "O prazo para reagendar este agendamento já passou." }, { status: 403 });
  if (error?.code === "P0002") return NextResponse.json({ error: "Agendamento não encontrado ou indisponível para alteração." }, { status: 404 });
  if (error) { console.error("[booking-reschedule] Falha ao reagendar.", { slug, code: error.code, message: error.message }); return NextResponse.json({ error: "Não foi possível reagendar agora. Tente novamente em alguns instantes." }, { status: 503 }); }
  return NextResponse.json({ ok: true });
}
