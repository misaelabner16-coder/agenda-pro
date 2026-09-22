"use client";

import { useState } from "react";
import { ActionForm, type ActionState } from "@/components/action-form";
import type { LocationHour } from "@/lib/types";

const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
type Interval = { start: string; end: string };
type Props = { hours: LocationHour[]; action: (state: ActionState, formData: FormData) => Promise<ActionState> };

export function BusinessHoursEditor({ hours, action }: Props) {
  const [periods, setPeriods] = useState<Record<number, Interval[]>>(() => Object.fromEntries(days.map((_, day) => [day, hours.filter((hour) => hour.week_day === day).map((hour) => ({ start: hour.start_time.slice(0, 5), end: hour.end_time.slice(0, 5) }))])));
  function update(day: number, index: number, field: keyof Interval, value: string) { setPeriods((current) => ({ ...current, [day]: current[day].map((interval, itemIndex) => itemIndex === index ? { ...interval, [field]: value } : interval) })); }
  function add(day: number) { setPeriods((current) => ({ ...current, [day]: [...current[day], { start: "09:00", end: "18:00" }] })); }
  function remove(day: number, index: number) { setPeriods((current) => ({ ...current, [day]: current[day].filter((_, itemIndex) => itemIndex !== index) })); }
  return <ActionForm action={action} className="mt-7 overflow-hidden rounded-2xl bg-white shadow-sm"><div className="divide-y divide-stone-100">{days.map((day, dayIndex) => <section className="p-4 sm:p-5" key={day}><input type="hidden" name={`hours_${dayIndex}`} value={JSON.stringify(periods[dayIndex])} /><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{day}</h2><button type="button" onClick={() => add(dayIndex)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">+ Período</button></div>{periods[dayIndex].length === 0 ? <p className="mt-3 text-sm text-stone-500">Fechado neste dia.</p> : <div className="mt-3 space-y-3">{periods[dayIndex].map((interval, intervalIndex) => <div className="flex flex-wrap items-end gap-2" key={`${dayIndex}-${intervalIndex}`}><label className="flex-1 text-sm text-stone-600">Início<input required type="time" value={interval.start} onChange={(event) => update(dayIndex, intervalIndex, "start", event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-2 py-2 text-stone-900" /></label><span className="pb-2 text-stone-400">–</span><label className="flex-1 text-sm text-stone-600">Fim<input required type="time" value={interval.end} onChange={(event) => update(dayIndex, intervalIndex, "end", event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 px-2 py-2 text-stone-900" /></label><button type="button" onClick={() => remove(dayIndex, intervalIndex)} className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" aria-label={`Remover período de ${day}`}>Remover</button></div>)}</div>}</section>)}</div><div className="flex justify-end border-t border-stone-100 p-4"><button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">Salvar horários</button></div></ActionForm>;
}
