import { saveBusinessHours } from "@/app/dashboard/actions";
import { requireWorkspace } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LocationHour } from "@/lib/types";
import { ActionForm } from "@/components/action-form";

const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export default async function BusinessHoursPage() {
  const workspace = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("location_hours").select("*").eq("location_id", workspace.location.id).order("week_day").order("start_time");
  const hours = (data ?? []) as LocationHour[];
  return <div className="max-w-4xl"><p className="text-sm font-semibold text-emerald-700">Funcionamento</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Quando sua agenda fica aberta?</h1><p className="mt-2 text-stone-600">Adicione até dois períodos por dia para representar, por exemplo, o intervalo de almoço.</p><ActionForm action={saveBusinessHours} className="mt-7 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="divide-y divide-stone-100">{days.map((day, index) => { const intervals = hours.filter((hour) => hour.week_day === index); const first = intervals[0]; const second = intervals[1]; return <fieldset className="grid gap-3 p-4 sm:grid-cols-[11rem_1fr_1fr] sm:items-center sm:p-5" key={day}><label className="flex items-center gap-3 font-semibold"><input type="checkbox" name={`active_${index}`} defaultChecked={Boolean(first)} className="size-4 accent-emerald-600" />{day}</label><label className="text-sm text-stone-500">1º período<div className="mt-1 flex items-center gap-2"><input type="time" name={`start_${index}_a`} defaultValue={first?.start_time?.slice(0,5) ?? "09:00"} className="w-full rounded-lg border border-stone-300 px-2 py-2" /><span>–</span><input type="time" name={`end_${index}_a`} defaultValue={first?.end_time?.slice(0,5) ?? "18:00"} className="w-full rounded-lg border border-stone-300 px-2 py-2" /></div></label><label className="text-sm text-stone-500">2º período <span className="font-normal">(opcional)</span><div className="mt-1 flex items-center gap-2"><input type="time" name={`start_${index}_b`} defaultValue={second?.start_time?.slice(0,5) ?? ""} className="w-full rounded-lg border border-stone-300 px-2 py-2" /><span>–</span><input type="time" name={`end_${index}_b`} defaultValue={second?.end_time?.slice(0,5) ?? ""} className="w-full rounded-lg border border-stone-300 px-2 py-2" /></div></label></fieldset>; })}</div><div className="flex justify-end border-t border-stone-100 p-4"><button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">Salvar horários</button></div></ActionForm></div>;
}
