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
  const phone = typeof body?.customer_phone === "string" ? body.customer_phone.replace(/\D/g, "") : "";
  if (!serviceId || Number.isNaN(new Date(startsAt).valueOf()) || name.length < 2 || name.length > 100 || !/^\d{8,15}$/.test(phone)) return NextResponse.json({ error: "Revise o nome, telefone e horário informados." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("book_public_appointment_with_management", { p_slug: slug, p_service_id: serviceId, p_starts_at: startsAt, p_customer_name: name, p_customer_phone: phone });
  if (error?.code === "23P01") return NextResponse.json({ error: "Esse horário acabou de ser reservado. Escolha outro horário." }, { status: 409 });
  if (error?.code === "P0002") return NextResponse.json({ error: "A agenda, o serviço ou o profissional não está mais disponível." }, { status: 409 });
  if (error?.code === "22023") return NextResponse.json({ error: "Revise os dados informados." }, { status: 400 });
  if (error) {
    console.error("[booking] Falha ao criar agendamento.", { slug, code: error.code, message: error.message });
    return NextResponse.json({ error: "Não foi possível confirmar agora. Tente novamente em alguns instantes." }, { status: 503 });
  }
  const row = Array.isArray(data) ? data[0] as { management_token?: string } | undefined : undefined;
  if (!row?.management_token) return NextResponse.json({ error: "Não foi possível criar o link de gerenciamento." }, { status: 500 });
  return NextResponse.json({ ok: true, management_url: `/p/${encodeURIComponent(slug)}/agendamento/${encodeURIComponent(row.management_token)}` }, { status: 201 });
}
