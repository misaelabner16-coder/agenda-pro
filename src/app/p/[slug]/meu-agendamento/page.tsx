import { notFound } from "next/navigation";
import { BookingAccessForm } from "@/components/booking-access-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function BookingAccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_booking_page", { p_slug: slug });
  if (error) throw new Error("Não foi possível carregar a agenda pública.");
  const bookingPage = Array.isArray(data) ? data[0] as { location_name: string; public_slug: string } | undefined : undefined;
  if (!bookingPage) notFound();
  return <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-8"><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl shadow-stone-200/70 sm:p-8"><p className="text-sm font-semibold text-emerald-700">{bookingPage.location_name}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Gerencie seu agendamento</h1><BookingAccessForm slug={bookingPage.public_slug} /></section></main>;
}
