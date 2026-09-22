import { cancelAppointmentSeries, createCustomerAndSeries } from "@/app/dashboard/actions";
import { ActionForm } from "@/components/action-form";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Customer, Service } from "@/lib/types";

export default async function CustomersPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const [customersResult, servicesResult, seriesResult, bookingsResult] = await Promise.all([
    supabase.from("customers").select("*").eq("organization_id", workspace.organization.id).order("name").limit(100),
    supabase.from("services").select("*").eq("organization_id", workspace.organization.id).eq("is_active", true).order("name"),
    supabase.from("appointment_series").select("id, customer_id, frequency, starts_on, ends_on, max_occurrences, is_active").eq("organization_id", workspace.organization.id).order("created_at", { ascending: false }),
    supabase.from("calendar_events").select("customer_id, starts_at").eq("organization_id", workspace.organization.id).eq("location_id", workspace.location.id).eq("event_type", "booking").order("starts_at", { ascending: false }),
  ]);
  const firstError = customersResult.error ?? servicesResult.error ?? seriesResult.error ?? bookingsResult.error;
  if (firstError) {
    console.error("[customers] Falha ao carregar clientes fixos.", { code: firstError.code, message: firstError.message });
    throw new Error("Não foi possível carregar os clientes.");
  }
  const { data: customers } = customersResult;
  const { data: services } = servicesResult;
  const { data: series } = seriesResult;
  const { data: bookings } = bookingsResult;
  const typedCustomers = (customers ?? []) as Customer[];
  const typedServices = (services ?? []) as Service[];
  const seriesByCustomer = new Map((series ?? []).map((item) => [item.customer_id as string, item]));
  const bookingSummaryByCustomer = new Map<string, { count: number; lastStartsAt: string }>();
  for (const booking of bookings ?? []) {
    const customerId = booking.customer_id as string | null;
    const startsAt = booking.starts_at as string;
    if (!customerId || !startsAt) continue;
    const current = bookingSummaryByCustomer.get(customerId);
    bookingSummaryByCustomer.set(customerId, current ? { count: current.count + 1, lastStartsAt: current.lastStartsAt } : { count: 1, lastStartsAt: startsAt });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: workspace.location.time_zone }).format(new Date());
  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem]"><section><p className="text-sm font-semibold text-emerald-700">Clientes</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Clientes</h1><p className="mt-2 text-stone-600">Clientes que já agendaram neste estabelecimento, identificados pelo telefone dentro da sua organização.</p><div className="mt-7 overflow-hidden rounded-2xl bg-white shadow-sm">{typedCustomers.length ? <div className="divide-y divide-stone-100">{typedCustomers.map((customer) => { const recurring = seriesByCustomer.get(customer.id); const summary = bookingSummaryByCustomer.get(customer.id); return <article className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" key={customer.id}><div><h2 className="font-semibold">{customer.name}</h2><p className="mt-1 text-sm text-stone-500">{customer.phone}</p><p className="mt-2 text-xs text-stone-500">{summary?.count ?? 0} agendamento(s){summary ? ` · último: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: workspace.location.time_zone }).format(new Date(summary.lastStartsAt))}` : ""}</p></div><div className="flex items-center gap-2">{recurring?.is_active ? <><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{recurring.frequency === "monthly" ? "Mensalista" : recurring.frequency === "biweekly" ? "Quinzenal" : "Semanal"}</span><ActionForm action={cancelAppointmentSeries}><input type="hidden" name="series_id" value={recurring.id as string} /><button className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Cancelar série</button></ActionForm></> : customer.is_fixed ? <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">Cliente fixo</span> : null}</div></article>; })}</div> : <p className="p-6 text-sm text-stone-500">Nenhum cliente cadastrado ainda.</p>}</div></section><aside className="h-fit rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Novo cliente fixo</h2><p className="mt-1 text-sm leading-6 text-stone-500">Para meses sem o dia escolhido, como dia 31 em fevereiro, o sistema pula aquele mês.</p><ActionForm action={createCustomerAndSeries} className="mt-5 space-y-4"><label className="block text-sm font-semibold">Nome<input required name="name" minLength={2} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label><label className="block text-sm font-semibold">Telefone<input required name="phone" inputMode="tel" placeholder="(11) 99999-9999" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label><label className="block text-sm font-semibold">Serviço<select required name="service_id" className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5"><option value="">Selecione</option>{typedServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-semibold">Frequência<select name="frequency" defaultValue="monthly" className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5"><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select></label><label className="block text-sm font-semibold">Horário<input required type="time" name="start_time" defaultValue="09:00" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label></div><label className="block text-sm font-semibold">Primeira data<input required type="date" name="starts_on" defaultValue={today} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label><label className="block text-sm font-semibold">Data final <span className="font-normal text-stone-500">(opcional)</span><input type="date" name="ends_on" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label><label className="block text-sm font-semibold">Máximo de ocorrências <span className="font-normal text-stone-500">(opcional)</span><input min="1" max="240" type="number" name="max_occurrences" placeholder="Ex.: 12" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label><p className="text-xs leading-5 text-stone-500">Sem data final nem quantidade, serão criadas as próximas 24 ocorrências para evitar uma série infinita sem controle.</p><button disabled={!typedServices.length} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Cadastrar cliente fixo</button></ActionForm></aside></div>;
}
