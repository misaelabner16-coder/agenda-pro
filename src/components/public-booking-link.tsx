"use client";

import { useState, useSyncExternalStore } from "react";

const subscribeToOrigin = () => () => {};
const getBrowserOrigin = () => window.location.origin;
const getServerOrigin = () => "";

export function PublicBookingLink({ slug }: { slug: string }) {
  const path = `/p/${encodeURIComponent(slug)}`;
  const origin = useSyncExternalStore(subscribeToOrigin, getBrowserOrigin, getServerOrigin);
  const url = `${origin}${path}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    const linkForCustomer = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(linkForCustomer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copie o link para seus clientes:", linkForCustomer);
    }
  }
  return <section className="premium-surface mt-6 rounded-2xl bg-emerald-50 p-5 sm:p-6"><p className="text-lg font-bold text-emerald-950">Link para enviar aos clientes</p><p className="mt-1 text-sm text-stone-600">Compartilhe este endereço para que escolham serviço, data e horário.</p><a href={path} target="_blank" rel="noopener noreferrer" className="mt-4 block break-all rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-semibold text-emerald-800 hover:underline">{url}</a><div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={copy} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">{copied ? "Link copiado" : "Copiar link"}</button><a href={path} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Abrir página de agendamento</a></div></section>;
}
