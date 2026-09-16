import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking-flow";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicService } from "@/lib/types";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <main className="grid min-h-screen place-items-center bg-stone-100 p-5"><section className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold">Agenda em configuração</h1><p className="mt-2 text-stone-600">Esta página ficará disponível assim que o Agenda Pro for conectado ao Supabase.</p></section></main>;
  const supabase = await createSupabaseServerClient();
  const { data: pageRows } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  const bookingPage = Array.isArray(pageRows) ? pageRows[0] as { organization_name: string; location_name: string; public_slug: string; time_zone: string } | undefined : undefined;
  if (!bookingPage) notFound();
  const { data: serviceRows } = await supabase.rpc("get_public_services", { p_slug: slug });
  const services = (Array.isArray(serviceRows) ? serviceRows : []) as PublicService[];
  return <main className="min-h-screen bg-stone-100 px-4 py-8 sm:py-14"><section className="mx-auto max-w-xl"><header className="rounded-t-3xl bg-stone-900 px-6 py-7 text-white sm:px-8"><p className="text-sm font-semibold text-emerald-300">Agendamento online</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{bookingPage.location_name}</h1><p className="mt-2 text-sm text-stone-300">Escolha um horário que funcione para você.</p></header><div className="rounded-b-3xl bg-white p-6 shadow-xl shadow-stone-200/80 sm:p-8">{services.length ? <BookingFlow slug={bookingPage.public_slug} locationName={bookingPage.location_name} timeZone={bookingPage.time_zone} services={services} /> : <p className="rounded-xl bg-stone-50 p-5 text-center text-stone-600">Este estabelecimento ainda não possui serviços disponíveis.</p>}</div><p className="mt-5 text-center text-xs text-stone-400">Agendado com Agenda Pro</p></section></main>;
}
