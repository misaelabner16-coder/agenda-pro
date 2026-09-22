import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking-flow";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicService } from "@/lib/types";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <main className="grid min-h-screen place-items-center bg-stone-100 p-5"><section className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold">Agenda em configuração</h1><p className="mt-2 text-stone-600">Esta página ficará disponível assim que o Agenda Pro for conectado ao Supabase.</p></section></main>;
  const supabase = await createSupabaseServerClient();
  const { data: pageRows, error: pageError } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (pageError) {
    console.error("[public-page] Falha ao carregar estabelecimento.", { slug, code: pageError.code, message: pageError.message });
    throw new Error("Não foi possível carregar a agenda pública.");
  }
  const bookingPage = Array.isArray(pageRows) ? pageRows[0] as { organization_name: string; location_name: string; public_slug: string; time_zone: string } | undefined : undefined;
  if (!bookingPage) notFound();
  const { data: serviceRows, error: serviceError } = await supabase.rpc("get_public_services", { p_slug: slug });
  if (serviceError) {
    console.error("[public-page] Falha ao carregar serviços.", { slug, code: serviceError.code, message: serviceError.message });
    throw new Error("Não foi possível carregar os serviços.");
  }
  const services = (Array.isArray(serviceRows) ? serviceRows : []) as PublicService[];
  return <main className="min-h-screen bg-stone-100 px-4 py-8 sm:py-14"><section className="mx-auto max-w-xl"><header className="rounded-t-3xl bg-stone-900 px-6 py-7 text-white sm:px-8"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-300">Agendamento online</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{bookingPage.location_name}</h1><p className="mt-2 text-sm text-stone-300">Escolha um horário que funcione para você.</p></div><Link href={`/p/${bookingPage.public_slug}/meu-agendamento`} className="shrink-0 rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-800">Meu agendamento</Link></div></header><div className="rounded-b-3xl bg-white p-6 shadow-xl shadow-stone-200/80 sm:p-8">{services.length ? <BookingFlow slug={bookingPage.public_slug} locationName={bookingPage.location_name} timeZone={bookingPage.time_zone} services={services} /> : <p className="rounded-xl bg-stone-50 p-5 text-center text-stone-600">Este estabelecimento ainda não possui serviços disponíveis.</p>}</div><p className="mt-5 text-center text-xs text-stone-400">Agendado com Agenda Pro</p></section></main>;
}
