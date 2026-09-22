import { saveCancellationSettings } from "@/app/dashboard/actions";
import { ActionForm } from "@/components/action-form";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("locations").select("customer_cancel_minimum_minutes").eq("id", workspace.location.id).single();
  if (error) {
    console.error("[settings] Falha ao carregar configurações.", { code: error.code, message: error.message });
    throw new Error("Não foi possível carregar as configurações.");
  }
  const minutes = (data as { customer_cancel_minimum_minutes?: number } | null)?.customer_cancel_minimum_minutes ?? 0;
  return <div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-700">Configurações</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Cancelamento pelo cliente</h1><p className="mt-2 text-stone-600">Defina até quando o cliente pode cancelar pelo link privado do próprio agendamento.</p><ActionForm action={saveCancellationSettings} className="mt-7 rounded-2xl bg-white p-5 shadow-sm sm:p-6"><label className="block text-sm font-semibold">Antecedência mínima para cancelar<input required min="0" max="10080" name="customer_cancel_minimum_minutes" type="number" defaultValue={minutes} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600" /></label><p className="mt-2 text-sm leading-6 text-stone-500">Exemplos: 360 = 6 horas, 720 = 12 horas e 1440 = 24 horas. Use 0 para permitir cancelar até o horário.</p><button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700">Salvar regra</button></ActionForm></div>;
}
