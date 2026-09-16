"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { priceToCents } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function dashboardPaths() { ["/dashboard", "/dashboard/servicos", "/dashboard/horarios", "/dashboard/agenda"].forEach((path) => revalidatePath(path)); }

export async function createService(formData: FormData) {
  const workspace = await requireWorkspace();
  const name = text(formData, "name");
  const duration = Number(text(formData, "duration"));
  if (name.length < 2 || !Number.isInteger(duration) || duration < 15 || duration > 480) throw new Error("Revise o nome e a duração do serviço.");
  const supabase = await createSupabaseServerClient();
  if (!workspace.location.default_professional_id) throw new Error("A unidade ainda não possui um profissional padrão.");
  const { error } = await supabase.rpc("create_service_for_default_professional", {
    p_organization_id: workspace.organization.id,
    p_professional_id: workspace.location.default_professional_id,
    p_name: name,
    p_duration_minutes: duration,
    p_price_cents: priceToCents(formData.get("price")),
  });
  if (error) throw new Error("Não foi possível cadastrar o serviço.");
  dashboardPaths();
}

export async function toggleService(formData: FormData) {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").update({ is_active: text(formData, "is_active") === "true" }).eq("id", text(formData, "service_id")).eq("organization_id", workspace.organization.id);
  if (error) throw new Error("Não foi possível atualizar o serviço.");
  dashboardPaths();
}

export async function deleteService(formData: FormData) {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").delete().eq("id", text(formData, "service_id")).eq("organization_id", workspace.organization.id);
  if (error) throw new Error("Não foi possível excluir o serviço.");
  dashboardPaths();
}

export async function saveBusinessHours(formData: FormData) {
  const workspace = await requireWorkspace();
  const hours: { week_day: number; start_time: string; end_time: string }[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (formData.get(`active_${day}`) !== "on") continue;
    for (const suffix of ["a", "b"]) {
      const start = text(formData, `start_${day}_${suffix}`);
      const end = text(formData, `end_${day}_${suffix}`);
      if (!start && !end) continue;
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) throw new Error("Revise os intervalos de funcionamento.");
      hours.push({ week_day: day, start_time: start, end_time: end });
    }
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_location_hours", { p_location_id: workspace.location.id, p_hours: hours });
  if (error) throw new Error("Não foi possível salvar os horários. Revise os intervalos informados.");
  dashboardPaths();
}

export async function createBlock(formData: FormData) {
  const workspace = await requireWorkspace();
  const date = text(formData, "date");
  const startsAt = text(formData, "starts_at");
  const endsAt = text(formData, "ends_at");
  const title = text(formData, "title") || "Horário bloqueado";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt) || endsAt <= startsAt) throw new Error("Revise o período do bloqueio.");
  if (!workspace.location.default_professional_id) throw new Error("A unidade ainda não possui um profissional padrão.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_schedule_block", {
    p_location_id: workspace.location.id,
    p_professional_id: workspace.location.default_professional_id,
    p_date: date,
    p_start_time: startsAt,
    p_end_time: endsAt,
    p_title: title,
  });
  if (error?.code === "23P01") throw new Error("Esse período já possui um agendamento ou bloqueio.");
  if (error) throw new Error("Não foi possível criar o bloqueio.");
  dashboardPaths();
}

export async function deleteBlock(formData: FormData) {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", text(formData, "event_id")).eq("organization_id", workspace.organization.id).eq("event_type", "block");
  if (error) throw new Error("Não foi possível remover o bloqueio.");
  dashboardPaths();
}
