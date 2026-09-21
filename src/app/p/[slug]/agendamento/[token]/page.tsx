import { notFound } from "next/navigation";
import { BookingManagement } from "@/components/booking-management";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export default async function BookingManagementPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_public_booking_management", { p_slug: slug, p_management_token: token });
  const booking = Array.isArray(data) ? data[0] as { location_name: string; time_zone: string; service_name: string; customer_name: string; starts_at: string; status: string; can_cancel: boolean } | undefined : undefined;
  if (!booking) notFound();
  return <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-8"><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl shadow-stone-200/70 sm:p-8"><p className="text-sm font-semibold text-emerald-700">Gerenciar agendamento</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{booking.location_name}</h1><div className="mt-6 rounded-xl bg-stone-50 p-4"><p className="font-semibold">{booking.service_name}</p><p className="mt-1 text-sm text-stone-600">{booking.customer_name} · {formatDateTime(booking.starts_at, booking.time_zone)}</p></div><BookingManagement slug={slug} token={token} canCancel={booking.can_cancel} status={booking.status} /></section></main>;
}
