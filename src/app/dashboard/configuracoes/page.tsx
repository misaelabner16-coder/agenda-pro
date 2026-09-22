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
  const useDays = minutes > 0 && minutes % 1440 === 0;
  const quantity = useDays ? minutes / 1440 : minutes / 60;
  return <div className="max-w-2xl"><p className="text-sm font-semibold text-emerald-700">Configurações</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Alterações pelo cliente</h1><p className="mt-2 text-stone-600">Defina a antecedência mínima para o cliente cancelar ou reagendar pelo link privado.</p><ActionForm action={saveCancellationSettings} className="mt-7 rounded-2xl bg-white p-5 shadow-sm sm:p-6"><div className="grid grid-cols-[1fr_9rem] gap-3"><label className="block text-sm font-semibold">Antecedência<input required min="0" max={useDays ? 7 : 168} name="customer_change_minimum_quantity" type="number" defaultValue={quantity} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600" /></label><label className="block text-sm font-semibold">Unidade<select name="customer_change_minimum_unit" defaultValue={useDays ? "days" : "hours"} className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 outline-none focus:border-emerald-600"><option value="hours">horas</option><option value="days">dias</option></select></label></div><p className="mt-2 text-sm leading-6 text-stone-500">Exemplos: 6 horas, 24 horas ou 2 dias. Use 0 horas para permitir alterações até o horário.</p><button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700">Salvar regra</button></ActionForm></div>;
}
