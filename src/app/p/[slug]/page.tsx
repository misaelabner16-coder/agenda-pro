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
  return (
    <main className="booking-shell min-h-screen px-4 pb-10">
      <nav aria-label="Agendamento" className="mx-auto flex max-w-5xl items-center justify-between gap-3 py-5 sm:py-7"><span className="flex items-center gap-2 text-sm font-bold"><span className="grid size-8 place-items-center rounded-xl bg-emerald-900 text-white">A</span>Agenda Pro</span><Link href={`/p/${bookingPage.public_slug}/meu-agendamento`} className="rounded-full border border-stone-300 bg-white px-4 py-3 text-xs font-semibold text-emerald-800 sm:text-sm">Meu agendamento ↗</Link></nav>
      <section className="mx-auto grid max-w-5xl items-start gap-5 pt-3 sm:pt-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-10">
        <header className="rounded-3xl bg-emerald-950 p-6 text-white sm:p-8 lg:sticky lg:top-8">
          <span className="mb-6 hidden size-14 place-items-center rounded-2xl border border-white/20 bg-white/5 text-2xl font-semibold text-emerald-200 lg:grid">{bookingPage.location_name.slice(0, 1)}</span>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-200">Reserve seu momento</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{bookingPage.location_name}</h1>
          <p className="mt-4 text-sm leading-7 text-emerald-100">Escolha o serviço e encontre o melhor horário para você. Simples, sem precisar criar uma conta.</p>
          <div className="mt-6 hidden border-t border-white/15 pt-5 text-xs leading-6 text-emerald-200 lg:block"><p>01 · Escolha seu serviço</p><p>02 · Encontre um horário</p><p>03 · Confirme e guarde seu link privado</p></div>
        </header>
        <div className="premium-surface min-w-0 rounded-3xl bg-white p-5 sm:p-8">
          {services.length ? <BookingFlow slug={bookingPage.public_slug} locationName={bookingPage.location_name} timeZone={bookingPage.time_zone} services={services} /> : <p className="rounded-xl bg-stone-50 p-5 text-center text-stone-600">Este estabelecimento ainda não possui serviços disponíveis.</p>}
        </div>
      </section>
      <p className="mx-auto mt-8 max-w-5xl text-center text-xs text-stone-500">Seu tempo, bem cuidado. · Agenda Pro</p>
    </main>
  );
}
