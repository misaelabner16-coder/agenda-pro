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
    const rawIntervals = text(formData, `hours_${day}`);
    if (!rawIntervals) continue;
    let intervals: unknown;
    try { intervals = JSON.parse(rawIntervals); } catch { return { error: "Revise os intervalos de funcionamento." }; }
    if (!Array.isArray(intervals)) return { error: "Revise os intervalos de funcionamento." };
    for (const interval of intervals) {
      const start = typeof interval?.start === "string" ? interval.start : "";
      const end = typeof interval?.end === "string" ? interval.end : "";
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) return { error: "Revise os intervalos de funcionamento." };
      hours.push({ week_day: day, start_time: start, end_time: end });
    }
  }
  const ordered = [...hours].sort((first, second) => first.week_day - second.week_day || first.start_time.localeCompare(second.start_time));
  if (ordered.some((interval, index) => index > 0 && interval.week_day === ordered[index - 1].week_day && interval.start_time < ordered[index - 1].end_time)) return { error: "Os períodos de um mesmo dia não podem se sobrepor." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_location_hours", { p_location_id: workspace.location.id, p_hours: ordered });
  if (error) return { error: "Não foi possível salvar os horários. Revise os intervalos informados." };
  revalidatePath("/dashboard/horarios");
  return { success: "Horários salvos com sucesso." };
}

export async function createAvailabilityBlock(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const mode = text(formData, "mode");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const startsAt = text(formData, "starts_at");
  const endsAt = text(formData, "ends_at");
  const title = text(formData, "title") || "Horário bloqueado";
  const weekDays = formData.getAll("week_days").map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!["single", "weekly", "range"].includes(mode)) return { error: "Escolha o tipo de bloqueio." };
  if (mode === "weekly" && weekDays.length === 0) return { error: "Selecione ao menos um dia da semana." };
  if (mode !== "weekly" && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate)) return { error: "Revise as datas do bloqueio." };
  if (mode !== "range" && (!/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt) || endsAt <= startsAt)) return { error: "Revise os horários do bloqueio." };
  if (!workspace.location.default_professional_id) return { error: "A unidade ainda não possui um profissional padrão." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_availability_block", {
    p_location_id: workspace.location.id,
    p_professional_id: workspace.location.default_professional_id,
    p_title: title,
    p_start_date: mode === "weekly" ? null : startDate,
    p_end_date: mode === "single" ? startDate : mode === "range" ? endDate : null,
    p_week_days: mode === "weekly" ? weekDays : null,
    p_start_time: mode === "range" ? null : startsAt,
    p_end_time: mode === "range" ? null : endsAt,
    p_is_all_day: mode === "range",
  });
  if (error?.code === "23P01") return { error: "Esse bloqueio conflita com um agendamento existente. Reagende ou cancele o atendimento antes." };
  if (error) return { error: "Não foi possível criar o bloqueio." };
  revalidateSchedule();
  return { success: "Bloqueio criado." };
}

export async function deleteBlock(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", text(formData, "event_id")).eq("organization_id", workspace.organization.id).eq("event_type", "block");
  if (error) return { error: "Não foi possível remover o bloqueio." };
  revalidateSchedule();
  return { success: "Bloqueio removido." };
}

export async function deleteAvailabilityBlock(_state: ActionState, formData: FormData): Promise<ActionState> {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("availability_blocks").delete().eq("id", text(formData, "block_id")).eq("organization_id", workspace.organization.id);
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
  const quantity = Number(text(formData, "customer_change_minimum_quantity"));
  const unit = text(formData, "customer_change_minimum_unit");
  if (!Number.isInteger(quantity) || quantity < 0 || !["hours", "days"].includes(unit)) return { error: "Informe uma antecedência válida." };
  const minutes = quantity * (unit === "days" ? 1440 : 60);
  if (minutes > 10080) return { error: "Informe no máximo 7 dias de antecedência." };
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
  const endsOn = text(formData, "ends_on");
  if (name.length < 2 || !/^\d{8,15}$/.test(phone)) return { error: "Informe nome e telefone válidos." };
  if (!serviceId || !["weekly", "biweekly", "monthly"].includes(frequency) || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{2}:\d{2}$/.test(startTime)) return { error: "Revise o serviço, a frequência, a data e o horário." };
  if (endsOn && (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < startsOn)) return { error: "A data final não pode ser anterior à primeira data." };
  if (maxOccurrences && (!Number.isInteger(Number(maxOccurrences)) || Number(maxOccurrences) < 1 || Number(maxOccurrences) > 240)) return { error: "Informe entre 1 e 240 ocorrências." };
  if (!workspace.location.default_professional_id) return { error: "A unidade ainda não possui um profissional padrão." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_customer_and_recurring_booking", {
    p_location_id: workspace.location.id,
    p_professional_id: workspace.location.default_professional_id,
    p_customer_name: name,
    p_customer_phone: phone,
    p_service_id: serviceId,
    p_frequency: frequency,
    p_starts_on: startsOn,
    p_start_time: startTime,
    p_ends_on: endsOn || null,
    p_max_occurrences: maxOccurrences ? Number(maxOccurrences) : null,
  });
  if (error?.code === "23P01") return { error: "Uma das datas está fora do expediente ou já ocupada. Nenhuma recorrência foi criada." };
  if (error?.code === "22023") return { error: "Revise os dados da recorrência e tente novamente." };
  if (error) {
    console.error("[recurrence] Falha ao cadastrar cliente fixo.", { code: error.code, message: error.message });
    return { error: "Não foi possível criar a recorrência." };
  }
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
