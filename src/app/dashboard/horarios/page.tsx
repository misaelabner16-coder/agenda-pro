import { saveBusinessHours } from "@/app/dashboard/actions";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LocationHour } from "@/lib/types";
import { BusinessHoursEditor } from "@/components/business-hours-editor";

export default async function BusinessHoursPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("location_hours").select("*").eq("location_id", workspace.location.id).order("week_day").order("start_time");
  if (error) {
    console.error("[business-hours] Falha ao carregar expediente.", { code: error.code, message: error.message });
    throw new Error("Não foi possível carregar os horários.");
  }
  return <div className="max-w-4xl"><p className="text-sm font-semibold text-emerald-700">Funcionamento</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Quando sua agenda fica aberta?</h1><p className="mt-2 text-stone-600">Adicione quantos períodos forem necessários em cada dia. Intervalos, como almoço, ficam entre os períodos.</p><BusinessHoursEditor action={saveBusinessHours} hours={(data ?? []) as LocationHour[]} /></div>;
}
