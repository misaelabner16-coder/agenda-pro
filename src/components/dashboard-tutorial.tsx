"use client";

import { useState, useSyncExternalStore } from "react";

const storageKey = "agenda-pro-dashboard-tutorial-complete";

export function DashboardTutorial() {
  const completed = useSyncExternalStore(() => () => {}, () => window.localStorage.getItem(storageKey) === "true", () => true);
  const [dismissed, setDismissed] = useState(false);
  if (completed || dismissed) return null;
  return <section className="mb-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-emerald-800">Primeiros passos</p><h2 className="mt-1 text-xl font-bold text-emerald-950">Deixe sua agenda pronta em 3 etapas.</h2></div><button onClick={() => { window.localStorage.setItem(storageKey, "true"); setDismissed(true); }} className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Fechar</button></div><ol className="mt-5 grid gap-3 text-sm text-emerald-950 sm:grid-cols-3"><li className="rounded-xl bg-white/70 p-3"><b>1. Serviços</b><br />Cadastre o que você atende.</li><li className="rounded-xl bg-white/70 p-3"><b>2. Horários</b><br />Defina quando a agenda fica aberta.</li><li className="rounded-xl bg-white/70 p-3"><b>3. Compartilhe</b><br />Envie seu link público aos clientes.</li></ol></section>;
}
