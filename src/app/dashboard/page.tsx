import Link from "next/link";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CalendarEvent, Service } from "@/lib/types";

export default async function DashboardPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const [{ data: events }, { data: services }] = await Promise.all([
    supabase.from("calendar_events").select("*").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).eq("status", "confirmed").gte("starts_at", now.toISOString()).order("starts_at").limit(5),
    supabase.from("services").select("*").eq("organization_id", workspace.organization.id).eq("is_active", true),
  ]);
  const upcoming = (events ?? []) as CalendarEvent[];
  const activeServices = (services ?? []) as Service[];
  const todayCount = upcoming.filter((event) => new Date(event.starts_at) < tomorrow && event.event_type === "booking").length;
  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-emerald-700">Visão geral</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Olá! Sua agenda está pronta.</h1><p className="mt-2 text-stone-600">Acompanhe seus próximos atendimentos e mantenha seus horários atualizados.</p></div><Link href="/dashboard/agenda" className="rounded-xl bg-stone-900 px-4 py-2.5 text-center text-sm font-semibold text-white">Gerenciar agenda</Link></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3"><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">Atendimentos hoje</p><p className="mt-2 text-3xl font-bold">{todayCount}</p></article><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">Próximos eventos</p><p className="mt-2 text-3xl font-bold">{upcoming.length}</p></article><article className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">Serviços ativos</p><p className="mt-2 text-3xl font-bold">{activeServices.length}</p></article></div>
      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Próximos eventos</h2><Link className="text-sm font-semibold text-emerald-700" href="/dashboard/agenda">Ver agenda</Link></div>{upcoming.length === 0 ? <EmptyState /> : <div className="mt-5 divide-y divide-stone-100">{upcoming.map((event) => <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between" key={event.id}><div><p className="font-semibold">{event.event_type === "block" ? event.title : event.service_name}</p><p className="text-sm text-stone-500">{event.event_type === "block" ? "Indisponível" : event.customer_name}</p></div><p className="text-sm font-medium text-stone-600">{formatDateTime(event.starts_at, workspace.location.time_zone)}</p></div>)}</div>}</section>
    </>
  );
}

function EmptyState() {
  return <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-8 text-center"><p className="font-semibold">Nenhum evento próximo.</p><p className="mt-1 text-sm text-stone-500">Cadastre serviços, defina seu expediente e compartilhe sua página pública.</p><div className="mt-4 flex justify-center gap-3"><Link className="text-sm font-semibold text-emerald-700" href="/dashboard/servicos">Cadastrar serviço</Link><Link className="text-sm font-semibold text-emerald-700" href="/dashboard/horarios">Definir horários</Link></div></div>;
}
