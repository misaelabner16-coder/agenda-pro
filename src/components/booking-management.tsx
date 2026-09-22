"use client";

import { useEffect, useRef, useState } from "react";

type Props = { slug: string; token: string; serviceId: string; timeZone: string; canCancel: boolean; canReschedule: boolean; status: string };

function todayInTimeZone(timeZone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()); }
function slotLabel(iso: string, timeZone: string) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso)); }

export function BookingManagement({ slug, token, serviceId, timeZone, canCancel, canReschedule, status }: Props) {
  const [state, setState] = useState(status === "cancelled" ? "cancelled" : "ready");
  const [error, setError] = useState("");
  const [date, setDate] = useState(() => todayInTimeZone(timeZone));
  const [slotResponse, setSlotResponse] = useState({ key: "", slots: [] as string[] });
  const [slotError, setSlotError] = useState({ key: "", message: "" });
  const [selectedSlot, setSelectedSlot] = useState("");
  const cancellationInFlight = useRef(false);
  const rescheduleInFlight = useRef(false);
  const requestKey = `${slug}:${serviceId}:${date}`;
  const slots = slotResponse.key === requestKey ? slotResponse.slots : [];
  const loadingSlots = state === "reschedule" && requestKey !== slotResponse.key && requestKey !== slotError.key;

  useEffect(() => {
    if (state !== "reschedule") return;
    const controller = new AbortController();
    fetch(`/api/public/${encodeURIComponent(slug)}/availability?service_id=${encodeURIComponent(serviceId)}&date=${date}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar horários."); setSlotResponse({ key: requestKey, slots: body.slots ?? [] }); })
      .catch((reason) => { if (reason.name !== "AbortError") setSlotError({ key: requestKey, message: reason instanceof Error ? reason.message : "Não foi possível carregar horários." }); });
    return () => controller.abort();
  }, [date, requestKey, serviceId, slug, state]);

  async function cancel() {
    if (cancellationInFlight.current) return;
    cancellationInFlight.current = true; setState("saving"); setError("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(slug)}/agendamento/${encodeURIComponent(token)}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível cancelar."); setState("ready"); return; }
      setState("cancelled");
    } catch { setError("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."); setState("ready"); }
    finally { cancellationInFlight.current = false; }
  }
  async function reschedule() {
    if (!selectedSlot || rescheduleInFlight.current) return;
    rescheduleInFlight.current = true; setState("saving"); setError("");
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(slug)}/agendamento/${encodeURIComponent(token)}/reschedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ starts_at: selectedSlot }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Não foi possível reagendar."); setState("reschedule"); if (response.status === 409) { setSlotResponse((current) => ({ ...current, slots: current.slots.filter((slot) => slot !== selectedSlot) })); setSelectedSlot(""); } return; }
      window.location.reload();
    } catch { setError("Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."); setState("reschedule"); }
    finally { rescheduleInFlight.current = false; }
  }

  if (state === "cancelled") return <p className="mt-6 rounded-xl bg-stone-100 px-4 py-3 text-center text-sm font-semibold text-stone-700">Este agendamento foi cancelado. O horário foi liberado.</p>;
  if (state === "reschedule") return <div className="mt-6"><button type="button" onClick={() => { setState("ready"); setError(""); }} className="text-sm font-semibold text-emerald-700">← Voltar</button><h2 className="mt-4 text-lg font-bold">Escolha o novo horário</h2><label className="mt-4 block text-sm font-semibold">Data<input type="date" min={todayInTimeZone(timeZone)} value={date} onChange={(event) => { setDate(event.target.value); setSelectedSlot(""); }} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600" /></label>{(error || slotError.key === requestKey) && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error || slotError.message}</p>}<div className="mt-4">{loadingSlots ? <p className="text-sm text-stone-500">Buscando horários...</p> : slots.length === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">Não há horários disponíveis nesta data.</p> : <div className="grid grid-cols-3 gap-2">{slots.map((slot) => <button type="button" key={slot} onClick={() => setSelectedSlot(slot)} className={`rounded-lg border px-2 py-2.5 text-sm font-semibold ${selectedSlot === slot ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-200 hover:border-emerald-500"}`}>{slotLabel(slot, timeZone)}</button>)}</div>}</div><button disabled={!selectedSlot} type="button" onClick={reschedule} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">Confirmar novo horário</button></div>;
  if (!canCancel && !canReschedule) return <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">O prazo para alterar este agendamento online já passou. Entre em contato com o estabelecimento.</p>;
  return <div className="mt-6 space-y-3"><p className="text-sm text-stone-600">Use este link privado para reagendar ou cancelar seu horário.</p>{error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}{canReschedule && <button type="button" onClick={() => { setSelectedSlot(""); setError(""); setState("reschedule"); }} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700">Reagendar</button>}{canCancel && <button disabled={state === "saving"} type="button" onClick={cancel} className="w-full rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">{state === "saving" ? "Cancelando..." : "Cancelar agendamento"}</button>}</div>;
}
