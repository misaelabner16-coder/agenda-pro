import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Agenda ainda não configurada." }, { status: 503 });
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("service_id");
  const date = searchParams.get("date");
  if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_available_slots", { p_slug: slug, p_service_id: serviceId, p_date: date });
  if (error) {
    console.error("[availability] Falha ao consultar horários.", { slug, code: error.code, message: error.message });
    if (error.code === "P0002") return NextResponse.json({ error: "Agenda ou serviço indisponível." }, { status: 404 });
    return NextResponse.json({ error: "Não foi possível consultar a disponibilidade agora." }, { status: 503 });
  }
  const rows = Array.isArray(data) ? data as { starts_at: string }[] : [];
  return NextResponse.json({ slots: rows.map((row) => row.starts_at) });
}
