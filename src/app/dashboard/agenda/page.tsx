import Link from "next/link";
import { cancelBooking, createAvailabilityBlock, deleteAvailabilityBlock, deleteBlock } from "@/app/dashboard/actions";
import { ActionForm } from "@/components/action-form";
import { AvailabilityBlockForm } from "@/components/availability-block-form";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { eventTouchesDate, localCalendarDate, shiftCalendarDate, validCalendarDate } from "@/lib/calendar-view";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AvailabilityBlock, CalendarEvent } from "@/lib/types";

const dayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function blockDescription(block: AvailabilityBlock) {
  if (block.week_days?.length) return `Toda ${block.week_days.map((day) => dayNames[day]).join(", ")} · ${block.start_time?.slice(0, 5)}–${block.end_time?.slice(0, 5)}`;
  if (block.is_all_day) return `${block.start_date} até ${block.end_date} · dia inteiro`;
  return `${block.start_date} · ${block.start_time?.slice(0, 5)}–${block.end_time?.slice(0, 5)}`;
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const workspace = await requireWorkspace();
  const { date: requestedDate } = await searchParams;
  const zone = workspace.location.time_zone;
  const today = localCalendarDate(new Date().toISOString(), zone);
  const date = validCalendarDate(requestedDate) ? requestedDate : today;
  const supabase = await createSupabaseServerClient();
  // UTC superset covers every local timezone; exact local-date filtering happens below.
  const [eventsResult, blocksResult] = await Promise.all([
    supabase.from("calendar_events").select("*", { count: "exact" }).eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).gt("ends_at", `${shiftCalendarDate(date, -1)}T00:00:00Z`).lt("starts_at", `${shiftCalendarDate(date, 2)}T00:00:00Z`).order("starts_at").limit(1000),
    supabase.from("availability_blocks").select("id, title, start_date, end_date, week_days, start_time, end_time, is_all_day").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).order("created_at", { ascending: false }),
  ]);
  const firstError = eventsResult.error ?? blocksResult.error;
  if (firstError) { console.error("[agenda] Falha ao carregar eventos.", { code: firstError.code, message: firstError.message }); throw new Error("Não foi possível carregar a agenda."); }
  const events = ((eventsResult.data ?? []) as CalendarEvent[]).filter((event) => eventTouchesDate(event.starts_at, event.ends_at, date, zone));
  const blocks = (blocksResult.data ?? []) as AvailabilityBlock[];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const dailyBlocks = blocks.filter((block) => (!block.start_date || block.start_date <= date) && (!block.end_date || block.end_date >= date) && (!block.week_days?.length || block.week_days.includes(weekday)));
  const confirmed = events.filter((event) => event.event_type === "booking" && event.status === "confirmed").length;
  const time = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(iso));
  return <div className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-stone-500">Seu dia, organizado</p><h1 className="mt-2 text-3xl font-bold">Agenda</h1><p className="mt-2 text-sm text-stone-600">Atendimentos e bloqueios, em um só lugar.</p></div><a href="#bloqueios" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Bloquear período</a></header>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="premium-surface min-w-0 overflow-hidden rounded-2xl bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4 sm:p-5">
          <div className="flex items-center gap-2"><Link aria-label="Dia anterior" href={`?date=${shiftCalendarDate(date, -1)}`} className="grid size-11 place-items-center rounded-lg border border-stone-200">←</Link><Link href={`?date=${today}`} className="rounded-lg border border-stone-200 px-4 py-3 text-sm font-semibold">Hoje</Link><Link aria-label="Próximo dia" href={`?date=${shiftCalendarDate(date, 1)}`} className="grid size-11 place-items-center rounded-lg border border-stone-200">→</Link></div>
          <form className="flex items-center gap-2"><label className="sr-only" htmlFor="agenda-date">Ir para data</label><input id="agenda-date" type="date" name="date" defaultValue={date} key={date} required className="min-w-0 rounded-lg border border-stone-200 px-2 py-2 text-sm" /><button className="rounded-lg bg-stone-100 px-3 py-3 text-sm font-semibold">Ver</button></form>
        </div>
        <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50 p-2">
          {Array.from({ length: 7 }, (_, i) => shiftCalendarDate(date, i - ((weekday + 6) % 7))).map((day) => <Link key={day} href={`?date=${day}`} aria-current={day === date ? "date" : undefined} className={`rounded-xl py-3 text-center ${day === date ? "bg-emerald-700 text-white shadow-sm" : "text-stone-600 hover:bg-stone-200"}`}><span className="block text-[10px] uppercase">{new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</span><span className="mt-1 block text-lg font-semibold">{Number(day.slice(-2))}</span></Link>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"><h2 className="font-semibold capitalize">{new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{confirmed} atendimento{confirmed === 1 ? "" : "s"}</span></div>
        {(eventsResult.count ?? 0) > (eventsResult.data?.length ?? 0) && <p role="alert" className="m-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Volume elevado: esta visualização pode estar incompleta. Entre em contato com o suporte.</p>}
        {dailyBlocks.length > 0 && <div className="space-y-2 px-5 pb-4">{dailyBlocks.map((block) => <div key={block.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Bloqueado · {block.title}</strong><span className="ml-2">{block.is_all_day ? "Dia inteiro" : `${block.start_time?.slice(0, 5)}–${block.end_time?.slice(0, 5)}`}</span></div>)}</div>}
        {events.length === 0 ? <div className="px-6 py-16 text-center"><span aria-hidden="true" className="text-4xl text-emerald-300">◷</span><h3 className="mt-3 font-semibold">Nenhum atendimento neste dia</h3><p className="mt-2 text-sm text-stone-500">Escolha outra data para consultar sua agenda.</p></div> : <div className="space-y-4 px-3 pb-6 sm:px-5">{events.map((event) => <article key={event.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
          <div className="pt-4 text-sm font-semibold tabular-nums">{time(event.starts_at)}<span className="mt-1 block text-xs font-normal text-stone-500">{time(event.ends_at)}</span></div>
          <div className={`min-w-0 rounded-xl border border-l-4 p-4 ${event.status === "cancelled" ? "border-stone-200 bg-stone-50" : event.event_type === "block" ? "border-amber-300 bg-amber-50/50" : "border-emerald-200 border-l-emerald-600 bg-emerald-50/50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{event.event_type === "booking" ? event.customer_name : event.title}</h3><span className="text-[11px] font-semibold text-stone-600">{event.status === "cancelled" ? "Cancelado" : event.event_type === "booking" ? "Confirmado" : "Bloqueado"}</span></div>
            <p className="mt-1 text-sm text-stone-600">{event.service_name}{event.service_duration_minutes ? ` · ${event.service_duration_minutes} min` : ""}{event.service_price_cents !== null ? ` · ${formatCurrency(event.service_price_cents)}` : ""}</p>
            <details className="mt-3 text-xs text-stone-600"><summary className="cursor-pointer py-1 font-semibold text-emerald-700">Detalhes e ações</summary><p className="mt-3">{formatDateTime(event.starts_at, zone)} · {event.customer_phone}</p>
              {event.status === "confirmed" && event.event_type === "booking" && <ActionForm action={cancelBooking} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="event_id" value={event.id} /><input aria-label="Motivo do cancelamento" name="reason" className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm" placeholder="Motivo (opcional)" /><button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Cancelar agendamento</button></ActionForm>}
              {event.event_type === "block" && event.status === "confirmed" && <ActionForm action={deleteBlock}><input type="hidden" name="event_id" value={event.id} /><button className="mt-3 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remover bloqueio</button></ActionForm>}
            </details>
          </div>
        </article>)}</div>}
        <p className="border-t border-stone-100 px-5 py-3 text-[11px] text-stone-500">Horários em {zone}. A lista mostra compromissos, não horários livres.</p>
      </section>
      <aside id="bloqueios" className="space-y-4 scroll-mt-6">
        <section className="premium-surface rounded-2xl bg-white p-5"><p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Disponibilidade</p><h2 className="mt-2 text-lg font-bold">Bloquear período</h2><p className="mt-2 text-sm leading-6 text-stone-500">Pausa, folga ou férias. Atendimentos existentes são preservados.</p><AvailabilityBlockForm key={date} defaultDate={date} action={createAvailabilityBlock} /></section>
        {blocks.length > 0 && <section className="premium-surface rounded-2xl bg-white p-5"><h2 className="font-semibold">Regras de bloqueio</h2><div className="mt-3 divide-y divide-stone-100">{blocks.map((block) => <article className="py-3" key={block.id}><p className="text-sm font-semibold">{block.title}</p><p className="mt-1 text-xs leading-5 text-stone-500">{blockDescription(block)}</p><ActionForm action={deleteAvailabilityBlock}><input type="hidden" name="block_id" value={block.id} /><button className="mt-2 rounded-lg py-2 text-xs font-semibold text-red-700">Remover regra</button></ActionForm></article>)}</div></section>}
      </aside>
    </div>
  </div>;
}
