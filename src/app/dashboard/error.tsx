"use client";

import { useEffect } from "react";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[dashboard] Falha ao carregar dados.", error); }, [error]);
  return <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold">Não foi possível carregar sua agenda</h1><p className="mt-2 text-sm leading-6 text-stone-600">Sua conta continua segura. Verifique a conexão e tente novamente.</p><button onClick={reset} className="mt-5 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white">Tentar novamente</button></section>;
}
