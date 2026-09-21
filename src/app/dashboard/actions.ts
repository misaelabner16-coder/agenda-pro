"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { priceToCents } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/action-form";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function revalidateServices(publicSlug: string) {
  revalidatePath("/dashboard/servicos");
  revalidatePath("/dashboard");
  revalidatePath(`/p/${publicSlug}`);
}

function revalidateSchedule() {
  revalidatePath("/dashboard/agenda");
  revalidatePath("/dashboard");
}

export async function createService(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const name = text(formData, "name");
  const duration = Number(text(formData, "duration"));
  if (name.length < 2 || !Number.isInteger(duration) || duration < 15 || duration > 480) return { error: "Revise o nome e a duração do serviço." };
  const supabase = await createSupabaseServerClient();
  if (!workspace.location.default_professional_id) return { error: "A unidade ainda não possui um profissional padrão." };
  const { error } = await supabase.rpc("create_service_for_default_professional", {
    p_organization_id: workspace.organization.id,
    p_professional_id: workspace.location.default_professional_id,
    p_name: name,
    p_duration_minutes: duration,
    p_price_cents: priceToCents(formData.get("price")),
  });
  if (error) return { error: "Não foi possível cadastrar o serviço." };
  revalidateServices(workspace.location.public_slug);
  return { success: "Serviço cadastrado." };
}

export async function toggleService(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").update({ is_active: text(formData, "is_active") === "true" }).eq("id", text(formData, "service_id")).eq("organization_id", workspace.organization.id);
  if (error) return { error: "Não foi possível atualizar o serviço." };
  revalidateServices(workspace.location.public_slug);
  return { success: "Serviço atualizado." };
}

export async function deleteService(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("services").delete().eq("id", text(formData, "service_id")).eq("organization_id", workspace.organization.id);
  if (error) return { error: "Não foi possível excluir o serviço." };
  revalidateServices(workspace.location.public_slug);
  return { success: "Serviço removido." };
}

export async function saveBusinessHours(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const hours: { week_day: number; start_time: string; end_time: string }[] = [];
  for (let day = 0; day < 7; day += 1) {
    if (formData.get(`active_${day}`) !== "on") continue;
    for (const suffix of ["a", "b"]) {
      const start = text(formData, `start_${day}_${suffix}`);
      const end = text(formData, `end_${day}_${suffix}`);
      if (!start && !end) continue;
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) return { error: "Revise os intervalos de funcionamento." };
      hours.push({ week_day: day, start_time: start, end_time: end });
    }
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_location_hours", { p_location_id: workspace.location.id, p_hours: hours });
  if (error) return { error: "Não foi possível salvar os horários. Revise os intervalos informados." };
  revalidatePath("/dashboard/horarios");
  return { success: "Horários salvos com sucesso." };
}

export async function createBlock(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const date = text(formData, "date");
  const startsAt = text(formData, "starts_at");
  const endsAt = text(formData, "ends_at");
  const title = text(formData, "title") || "Horário bloqueado";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt) || endsAt <= startsAt) return { error: "Revise o período do bloqueio." };
  if (!workspace.location.default_professional_id) return { error: "A unidade ainda não possui um profissional padrão." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_schedule_block", {
    p_location_id: workspace.location.id,
    p_professional_id: workspace.location.default_professional_id,
    p_date: date,
    p_start_time: startsAt,
    p_end_time: endsAt,
    p_title: title,
  });
  if (error?.code === "23P01") return { error: "Esse período já possui um agendamento ou bloqueio." };
  if (error) return { error: "Não foi possível criar o bloqueio." };
  revalidateSchedule();
  return { success: "Período bloqueado." };
}

export async function deleteBlock(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", text(formData, "event_id")).eq("organization_id", workspace.organization.id).eq("event_type", "block");
  if (error) return { error: "Não foi possível remover o bloqueio." };
  revalidateSchedule();
  return { success: "Bloqueio removido." };
}

export async function cancelBooking(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_booking_as_staff", { p_event_id: text(formData, "event_id"), p_reason: text(formData, "reason") || null });
  if (error) return { error: "Não foi possível cancelar o agendamento." };
  revalidateSchedule();
  return { success: "Agendamento cancelado e horário liberado." };
}

export async function saveCancellationSettings(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const minutes = Number(text(formData, "customer_cancel_minimum_minutes"));
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) return { error: "Informe uma antecedência entre 0 e 10.080 minutos." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("locations").update({ customer_cancel_minimum_minutes: minutes }).eq("id", workspace.location.id).eq("organization_id", workspace.organization.id);
  if (error) return { error: "Não foi possível salvar a configuração." };
  revalidatePath("/dashboard/configuracoes");
  return { success: "Regra de cancelamento salva." };
}

export async function createCustomerAndSeries(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const name = text(formData, "name");
  const phone = text(formData, "phone").replace(/\D/g, "");
  const frequency = text(formData, "frequency");
  const startsOn = text(formData, "starts_on");
  const startTime = text(formData, "start_time");
  const serviceId = text(formData, "service_id");
  const maxOccurrences = text(formData, "max_occurrences");
  if (name.length < 2 || !/^\d{8,15}$/.test(phone)) return { error: "Informe nome e telefone válidos." };
  if (!workspace.location.default_professional_id) return { error: "A unidade ainda não possui um profissional padrão." };
  const supabase = await createSupabaseServerClient();
  const { data: customer, error: customerError } = await supabase.from("customers").upsert({ organization_id: workspace.organization.id, name, phone, is_fixed: true }, { onConflict: "organization_id,phone" }).select("id").single();
  if (customerError || !customer) return { error: "Não foi possível cadastrar o cliente." };
  const { error } = await supabase.rpc("create_recurring_booking", {
    p_location_id: workspace.location.id,
    p_professional_id: workspace.location.default_professional_id,
    p_customer_id: customer.id,
    p_service_id: serviceId,
    p_frequency: frequency,
    p_starts_on: startsOn,
    p_start_time: startTime,
    p_ends_on: text(formData, "ends_on") || null,
    p_max_occurrences: maxOccurrences ? Number(maxOccurrences) : null,
  });
  if (error?.code === "23P01") return { error: "Há conflito com outro agendamento. Nenhuma recorrência foi criada." };
  if (error) return { error: "Não foi possível criar a recorrência." };
  revalidatePath("/dashboard/clientes");
  revalidateSchedule();
  return { success: "Cliente fixo e recorrência cadastrados." };
}

export async function cancelAppointmentSeries(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_appointment_series", { p_series_id: text(formData, "series_id") });
  if (error) return { error: "Não foi possível cancelar a série." };
  revalidatePath("/dashboard/clientes");
  revalidateSchedule();
  return { success: "Série cancelada. Os horários futuros foram liberados." };
}
