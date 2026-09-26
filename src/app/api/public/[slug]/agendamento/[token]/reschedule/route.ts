import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Rebooking uses the private reservation's duration, not today's service duration.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503, headers });
  const { slug, token } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^[a-f0-9]{64}$/i.test(token) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400, headers });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_reschedule_slots", { p_slug: slug, p_management_token: token, p_date: date });
  if (error?.code === "42501") return NextResponse.json({ error: "O prazo para reagendar já passou." }, { status: 403, headers });
  if (error?.code === "P0002") return NextResponse.json({ error: "Agendamento ou serviço indisponível." }, { status: 404, headers });
  if (error) {
    console.error("[reschedule-slots] Falha ao consultar horários.", { code: error.code });
    return NextResponse.json({ error: "Não foi possível consultar horários agora." }, { status: 503, headers });
  }
  const rows = Array.isArray(data) ? data as { starts_at: string }[] : [];
  return NextResponse.json({ slots: rows.map((row) => row.starts_at) }, { headers });
}

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
