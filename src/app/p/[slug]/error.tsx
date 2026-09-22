"use client";

import { useEffect } from "react";

export default function PublicBookingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[public-booking] Falha ao carregar página.", error); }, [error]);
  return <main className="grid min-h-screen place-items-center bg-stone-100 p-5"><section className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm"><h1 className="text-xl font-bold">Não foi possível abrir esta agenda</h1><p className="mt-2 text-sm leading-6 text-stone-600">Verifique sua conexão e tente novamente. Nenhum agendamento foi alterado.</p><button onClick={reset} className="mt-5 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white">Tentar novamente</button></section></main>;
}
