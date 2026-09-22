"use client";

import { useState } from "react";

export function PublicBookingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie o link público:", url);
    }
  }
  return <section className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 sm:p-6"><p className="text-sm font-semibold text-emerald-800">Seu link público de agendamento</p><p className="mt-2 break-all rounded-xl bg-white px-3 py-2.5 text-sm text-stone-700 shadow-sm">{url}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={copy} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">{copied ? "Link copiado" : "Copiar link"}</button><a href={url} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Abrir página pública</a></div></section>;
}
