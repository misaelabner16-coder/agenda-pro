import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PublicInputError, readPublicJson, validDate, validInstant, validSlug, validToken, privateResponseHeaders } from "@/lib/web-security";

// Rebooking uses the private reservation's duration, not today's service duration.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const headers = privateResponseHeaders;
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503, headers });
  const { slug, token } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!validSlug(slug) || !validToken(token) || !validDate(date)) {
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
  let body: Record<string, unknown>;
  try { body = await readPublicJson(request); }
  catch (error) { return NextResponse.json({ error: "Dados inválidos." }, { status: error instanceof PublicInputError ? error.status : 400, headers: privateResponseHeaders }); }
  const startsAt = typeof body?.starts_at === "string" ? body.starts_at : "";
  if (!validSlug(slug) || !validToken(token) || !validInstant(startsAt)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_public_booking", { p_slug: slug, p_management_token: token, p_new_starts_at: startsAt });
  if (error?.code === "23P01") return NextResponse.json({ error: "Esse horário acabou de ficar indisponível. Escolha outro." }, { status: 409 });
  if (error?.code === "42501") return NextResponse.json({ error: "O prazo para reagendar este agendamento já passou." }, { status: 403 });
  if (error?.code === "P0002") return NextResponse.json({ error: "Agendamento não encontrado ou indisponível para alteração." }, { status: 404 });
  if (error?.code === "22023") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  if (error) { console.error("[booking-reschedule] Falha ao reagendar.", { code: error.code }); return NextResponse.json({ error: "Não foi possível reagendar agora. Tente novamente em alguns instantes." }, { status: 503 }); }
  return NextResponse.json({ ok: true }, { headers: privateResponseHeaders });
}
