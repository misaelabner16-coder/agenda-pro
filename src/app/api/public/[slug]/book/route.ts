import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503 });
  const { slug } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const serviceId = typeof body?.service_id === "string" ? body.service_id : "";
  const startsAt = typeof body?.starts_at === "string" ? body.starts_at : "";
  const name = typeof body?.customer_name === "string" ? body.customer_name.trim() : "";
  const phone = typeof body?.customer_phone === "string" ? body.customer_phone.trim() : "";
  if (!serviceId || Number.isNaN(new Date(startsAt).valueOf()) || name.length < 2 || phone.length < 8) return NextResponse.json({ error: "Revise os dados do agendamento." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("book_public_appointment", { p_slug: slug, p_service_id: serviceId, p_starts_at: startsAt, p_customer_name: name, p_customer_phone: phone });
  if (error?.code === "23P01") return NextResponse.json({ error: "Esse horário acabou de ser reservado. Escolha outro horário." }, { status: 409 });
  if (error) return NextResponse.json({ error: "Não foi possível confirmar o agendamento." }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
