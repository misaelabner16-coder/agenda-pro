"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { PublicService } from "@/lib/types";

type Props = { slug: string; locationName: string; timeZone: string; services: PublicService[] };
type Step = "service" | "slot" | "details" | "success";

function todayInTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function slotLabel(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

function dateLabel(date: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(`${date}T12:00:00Z`));
}

export function BookingFlow({ slug, locationName, timeZone, services }: Props) {
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(() => todayInTimeZone(timeZone));
  const [slotResponse, setSlotResponse] = useState({ key: "", slots: [] as string[] });
  const [slotError, setSlotError] = useState({ key: "", message: "" });
  const [selectedSlot, setSelectedSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const selectedService = useMemo(() => services.find((service) => service.id === serviceId), [services, serviceId]);
  const requestKey = `${slug}:${serviceId}:${date}`;
  const slots = slotResponse.key === requestKey ? slotResponse.slots : [];
  const loadingSlots = requestKey !== slotResponse.key && requestKey !== slotError.key;
  const error = bookingError || (slotError.key === requestKey ? slotError.message : "");
  const usableSelectedSlot = slots.includes(selectedSlot) ? selectedSlot : "";

  useEffect(() => {
    if (!serviceId || !date) return;
    const controller = new AbortController();
    fetch(`/api/public/${encodeURIComponent(slug)}/availability?service_id=${encodeURIComponent(serviceId)}&date=${date}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os horários.");
        setSlotResponse({ key: requestKey, slots: body.slots ?? [] });
      })
      .catch((reason) => { if (reason.name !== "AbortError") setSlotError({ key: requestKey, message: reason.message }); });
    return () => controller.abort();
  }, [slug, serviceId, date, requestKey]);

  async function confirm(formData: FormData) {
    if (!usableSelectedSlot || !selectedService) return;
    setSubmitting(true); setBookingError("");
    const response = await fetch(`/api/public/${encodeURIComponent(slug)}/book`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ service_id: selectedService.id, starts_at: usableSelectedSlot, customer_name: formData.get("name"), customer_phone: formData.get("phone") }),
    });
    const body = await response.json();
    setSubmitting(false);
    if (!response.ok) { setBookingError(body.error ?? "Não foi possível confirmar o agendamento."); if (response.status === 409) setStep("slot"); return; }
    setStep("success");
  }

  if (step === "success" && selectedService) return <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-center"><span className="grid mx-auto size-12 place-items-center rounded-full bg-emerald-600 text-xl font-bold text-white">✓</span><h2 className="mt-4 text-xl font-bold text-emerald-950">Agendamento confirmado!</h2><p className="mt-2 leading-7 text-emerald-900">{selectedService.name} em {dateLabel(date, timeZone)} às {slotLabel(usableSelectedSlot, timeZone)}.</p><p className="mt-4 text-sm text-emerald-800">{locationName} espera por você.</p><button onClick={() => { setStep("service"); setSelectedSlot(""); }} className="mt-6 text-sm font-semibold text-emerald-800 underline">Fazer outro agendamento</button></div>;

  return <div>
    <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-stone-500"><span className={step === "service" ? "text-emerald-700" : ""}>1. Serviço</span><span>—</span><span className={step === "slot" ? "text-emerald-700" : ""}>2. Horário</span><span>—</span><span className={step === "details" ? "text-emerald-700" : ""}>3. Dados</span></div>
    {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {step === "service" && <section><h2 className="text-xl font-bold">Escolha um serviço</h2><div className="mt-4 space-y-3">{services.map((service) => <button onClick={() => setServiceId(service.id)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${serviceId === service.id ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-stone-200 hover:border-stone-300"}`} key={service.id}><div><p className="font-semibold">{service.name}</p><p className="mt-1 text-sm text-stone-500">{service.duration_minutes} minutos</p></div><span className="text-sm font-semibold">{formatCurrency(service.price_cents)}</span></button>)}</div><button disabled={!serviceId} onClick={() => setStep("slot")} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Continuar</button></section>}
    {step === "slot" && <section><button onClick={() => setStep("service")} className="text-sm font-semibold text-emerald-700">← Voltar</button><h2 className="mt-4 text-xl font-bold">Escolha data e horário</h2><label className="mt-4 block text-sm font-semibold">Data<input type="date" min={todayInTimeZone(timeZone)} value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600" /></label><div className="mt-5"><p className="text-sm font-semibold">Horários disponíveis</p>{loadingSlots ? <p className="mt-3 text-sm text-stone-500">Buscando horários...</p> : slots.length === 0 ? <p className="mt-3 rounded-xl bg-stone-50 p-4 text-sm text-stone-600">Não há horários disponíveis nesta data. Escolha outro dia.</p> : <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map((slot) => <button onClick={() => setSelectedSlot(slot)} className={`rounded-lg border px-2 py-2.5 text-sm font-semibold ${usableSelectedSlot === slot ? "border-emerald-600 bg-emerald-600 text-white" : "border-stone-200 hover:border-emerald-500"}`} key={slot}>{slotLabel(slot, timeZone)}</button>)}</div>}</div><button disabled={!usableSelectedSlot} onClick={() => setStep("details")} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Continuar</button></section>}
    {step === "details" && selectedService && usableSelectedSlot && <section><button onClick={() => setStep("slot")} className="text-sm font-semibold text-emerald-700">← Voltar</button><h2 className="mt-4 text-xl font-bold">Seus dados</h2><div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-600"><p className="font-semibold text-stone-800">{selectedService.name}</p><p className="mt-1 capitalize">{dateLabel(date, timeZone)} às {slotLabel(usableSelectedSlot, timeZone)}</p></div><form action={confirm} className="mt-5 space-y-4"><label className="block text-sm font-semibold">Seu nome<input required name="name" minLength={2} autoComplete="name" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600" placeholder="Como podemos te chamar?" /></label><label className="block text-sm font-semibold">Telefone<input required name="phone" minLength={8} inputMode="tel" autoComplete="tel" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600" placeholder="(11) 99999-9999" /></label><button disabled={submitting} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{submitting ? "Confirmando..." : "Confirmar agendamento"}</button></form></section>}
  </div>;
}
