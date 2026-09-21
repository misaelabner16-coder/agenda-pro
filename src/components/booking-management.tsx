"use client";

import { useState } from "react";

type Props = { slug: string; token: string; canCancel: boolean; status: string };

export function BookingManagement({ slug, token, canCancel, status }: Props) {
  const [state, setState] = useState(status === "cancelled" ? "cancelled" : "ready");
  const [error, setError] = useState("");
  async function cancel() {
    setState("saving"); setError("");
    const response = await fetch(`/api/public/${encodeURIComponent(slug)}/agendamento/${encodeURIComponent(token)}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "Não foi possível cancelar."); setState("ready"); return; }
    setState("cancelled");
  }
  if (state === "cancelled") return <p className="mt-6 rounded-xl bg-stone-100 px-4 py-3 text-center text-sm font-semibold text-stone-700">Este agendamento foi cancelado. O horário foi liberado.</p>;
  if (!canCancel) return <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">O prazo para cancelamento online já passou. Entre em contato com o estabelecimento.</p>;
  return <div className="mt-6"><p className="text-sm text-stone-600">Precisa desmarcar? O horário será liberado imediatamente.</p>{error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button disabled={state === "saving"} onClick={cancel} className="mt-3 w-full rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">{state === "saving" ? "Cancelando..." : "Cancelar agendamento"}</button></div>;
}
