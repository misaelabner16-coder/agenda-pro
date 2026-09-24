import Link from "next/link";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CalendarEvent, Service } from "@/lib/types";
import { DashboardTutorial } from "@/components/dashboard-tutorial";
import { PublicBookingLink } from "@/components/public-booking-link";

export default async function DashboardPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const countWindowStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const countWindowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const [eventsResult, servicesResult, nearbyBookingsResult] = await Promise.all([
    supabase.from("calendar_events").select("*").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).eq("status", "confirmed").gte("starts_at", now.toISOString()).order("starts_at").limit(5),
    supabase.from("services").select("*").eq("organization_id", workspace.organization.id).eq("is_active", true),
    supabase.from("calendar_events").select("starts_at").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).eq("event_type", "booking").eq("status", "confirmed").gte("starts_at", countWindowStart.toISOString()).lt("starts_at", countWindowEnd.toISOString()),
  ]);
  const firstError = eventsResult.error ?? servicesResult.error ?? nearbyBookingsResult.error;
  if (firstError) {
    console.error("[dashboard] Falha ao carregar resumo.", { code: firstError.code, message: firstError.message });
    throw new Error("Não foi possível carregar o resumo da agenda.");
  }
  const { data: events } = eventsResult;
  const { data: services } = servicesResult;
  const { data: nearbyBookings } = nearbyBookingsResult;
  const upcoming = (events ?? []) as CalendarEvent[];
  const activeServices = (services ?? []) as Service[];
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.location.time_zone });
  const today = localDate.format(now);
  const todayCount = (nearbyBookings ?? []).filter((event) => localDate.format(new Date(String(event.starts_at))) === today).length;
  return (
    <>
      <DashboardTutorial />
      <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-stone-500">Visão geral</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Tudo pronto para um bom dia.</h1><p className="mt-3 text-sm text-stone-600">Seus atendimentos e atalhos para cuidar da sua agenda.</p></div><Link href="/dashboard/agenda" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Abrir agenda →</Link></header>
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4"><article className="premium-surface rounded-2xl bg-white p-3 sm:p-5"><p className="text-xs font-medium sm:text-sm text-stone-500">Atendimentos hoje</p><p className="mt-3 text-3xl font-bold text-emerald-950">{todayCount}</p><div className="mt-5 h-0.5 w-10 rounded-full bg-gold-400" /></article><article className="premium-surface rounded-2xl bg-white p-3 sm:p-5"><p className="text-xs font-medium sm:text-sm text-stone-500">Próximos eventos</p><p className="mt-3 text-3xl font-bold text-emerald-950">{upcoming.length}</p><div className="mt-5 h-0.5 w-10 rounded-full bg-gold-400" /></article><article className="premium-surface rounded-2xl bg-white p-3 sm:p-5"><p className="text-xs font-medium sm:text-sm text-stone-500">Serviços ativos</p><p className="mt-3 text-3xl font-bold text-emerald-950">{activeServices.length}</p><div className="mt-5 h-0.5 w-10 rounded-full bg-gold-400" /></article></div>
      <PublicBookingLink slug={workspace.location.public_slug} />
      <section className="premium-surface mt-6 rounded-2xl bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Próximos eventos</h2><Link className="text-sm font-semibold text-emerald-700" href="/dashboard/agenda">Ver agenda</Link></div>{upcoming.length === 0 ? <EmptyState /> : <div className="mt-5 divide-y divide-stone-100">{upcoming.map((event) => <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between" key={event.id}><div><p className="font-semibold">{event.event_type === "block" ? event.title : event.service_name}</p><p className="text-sm text-stone-500">{event.event_type === "block" ? "Indisponível" : event.customer_name}</p></div><p className="text-sm font-medium text-stone-600">{formatDateTime(event.starts_at, workspace.location.time_zone)}</p></div>)}</div>}</section>
    </>
  );
}

function EmptyState() {
  return <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-8 text-center"><p className="font-semibold">Nenhum evento próximo.</p><p className="mt-1 text-sm text-stone-500">Cadastre serviços, defina seu expediente e compartilhe sua página pública.</p><div className="mt-4 flex justify-center gap-3"><Link className="text-sm font-semibold text-emerald-700" href="/dashboard/servicos">Cadastrar serviço</Link><Link className="text-sm font-semibold text-emerald-700" href="/dashboard/horarios">Definir horários</Link></div></div>;
}
