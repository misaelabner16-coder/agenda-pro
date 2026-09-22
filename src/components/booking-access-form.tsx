"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BookingAccessForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = value.trim().match(/[a-f0-9]{64}$/i)?.[0];
    if (!token) { setError("Cole o link privado completo ou o código recebido após o agendamento."); return; }
    router.push(`/p/${encodeURIComponent(slug)}/agendamento/${token}`);
  }
  return <form onSubmit={submit} className="mt-5 space-y-4"><p className="text-sm leading-6 text-stone-600">Cole o link privado que você recebeu ao confirmar o agendamento. Ele é pessoal e permite visualizar, reagendar ou cancelar somente o seu horário.</p><label className="block text-sm font-semibold">Link ou código do agendamento<input required value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 font-mono text-sm outline-none focus:border-emerald-600" placeholder="Cole aqui seu link privado" /></label>{error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<button className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700">Acessar agendamento</button></form>;
}
