import { cancelBooking, createAvailabilityBlock, deleteAvailabilityBlock, deleteBlock } from "@/app/dashboard/actions";
import { ActionForm } from "@/components/action-form";
import { AvailabilityBlockForm } from "@/components/availability-block-form";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AvailabilityBlock, CalendarEvent } from "@/lib/types";

const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function blockDescription(block: AvailabilityBlock) {
  if (block.week_days?.length) return `Toda ${block.week_days.map((day) => dayNames[day]).join(", ")} · ${block.start_time?.slice(0, 5)}–${block.end_time?.slice(0, 5)}`;
  if (block.is_all_day) return `${block.start_date} até ${block.end_date} · dia inteiro`;
  return `${block.start_date} · ${block.start_time?.slice(0, 5)}–${block.end_time?.slice(0, 5)}`;
}

export default async function AgendaPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const retentionStart = new Date(); retentionStart.setDate(retentionStart.getDate() - 30);
  const [eventsResult, blocksResult] = await Promise.all([
    supabase.from("calendar_events").select("*").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).gte("ends_at", retentionStart.toISOString()).order("starts_at").limit(100),
    supabase.from("availability_blocks").select("id, title, start_date, end_date, week_days, start_time, end_time, is_all_day").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).order("created_at", { ascending: false }),
  ]);
  const firstError = eventsResult.error ?? blocksResult.error;
  if (firstError) { console.error("[agenda] Falha ao carregar eventos.", { code: firstError.code, message: firstError.message }); throw new Error("Não foi possível carregar a agenda."); }
  const events = (eventsResult.data ?? []) as CalendarEvent[];
  const blocks = (blocksResult.data ?? []) as AvailabilityBlock[];
  const defaultDate = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.location.time_zone }).format(new Date());
  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]"><section><p className="text-sm font-semibold text-emerald-700">Agenda</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Próximos horários</h1><p className="mt-2 text-stone-600">Atendimentos, cancelamentos e períodos bloqueados.</p><div className="mt-7 overflow-hidden rounded-2xl bg-white shadow-sm">{events.length === 0 ? <p className="p-6 text-sm text-stone-500">Nenhum compromisso futuro. Quando um cliente agendar, ele aparecerá aqui.</p> : <div className="divide-y divide-stone-100">{events.map((event) => <article className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${event.status === "cancelled" ? "bg-stone-50/80 opacity-75" : ""}`} key={event.id}><div><div className="flex items-center gap-2"><h2 className="font-semibold">{event.event_type === "booking" ? event.service_name : event.title}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.status === "cancelled" ? "bg-stone-200 text-stone-600" : event.event_type === "booking" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{event.status === "cancelled" ? "Cancelado" : event.event_type === "booking" ? "Agendado" : "Bloqueado"}</span></div><p className="mt-1 text-sm text-stone-600">{event.event_type === "booking" ? `${event.customer_name} · ${event.customer_phone}` : "Indisponível para novos agendamentos"}</p><p className="mt-1 text-sm text-stone-500">{formatDateTime(event.starts_at, workspace.location.time_zone)} · {event.service_price_cents !== null ? formatCurrency(event.service_price_cents) : ""}</p></div>{event.status === "confirmed" && event.event_type === "booking" && <ActionForm action={cancelBooking} className="flex gap-2"><input type="hidden" name="event_id" value={event.id} /><input name="reason" className="min-w-0 rounded-lg border border-stone-200 px-2 py-2 text-sm" placeholder="Motivo (opcional)" /><button className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Cancelar</button></ActionForm>}{event.event_type === "block" && event.status === "confirmed" && <ActionForm action={deleteBlock}><input type="hidden" name="event_id" value={event.id} /><button className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remover bloqueio</button></ActionForm>}</article>)}</div>}</div>{blocks.length > 0 && <section className="mt-7"><h2 className="text-lg font-bold">Regras de bloqueio</h2><div className="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="divide-y divide-stone-100">{blocks.map((block) => <article className="flex items-center justify-between gap-3 p-4" key={block.id}><div><p className="font-semibold">{block.title}</p><p className="mt-1 text-sm text-stone-500">{blockDescription(block)}</p></div><ActionForm action={deleteAvailabilityBlock}><input type="hidden" name="block_id" value={block.id} /><button className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remover</button></ActionForm></article>)}</div></div></section>}</section><aside className="h-fit rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Bloquear período</h2><p className="mt-1 text-sm leading-6 text-stone-500">Use uma regra para uma data, uma pausa recorrente ou férias. Bloqueios conflitando com atendimentos são recusados.</p><AvailabilityBlockForm defaultDate={defaultDate} action={createAvailabilityBlock} /></aside></div>;
}
