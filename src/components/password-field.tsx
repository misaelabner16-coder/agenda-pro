"use client";

import { useState } from "react";

type Props = { autoComplete: string };

export function PasswordField({ autoComplete }: Props) {
  const [visible, setVisible] = useState(false);
  return <label className="block text-sm font-semibold">Senha<div className="relative mt-1.5"><input required minLength={8} type={visible ? "text" : "password"} name="password" autoComplete={autoComplete} className="w-full rounded-xl border border-stone-300 px-3 py-3 pr-12 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="Mínimo de 8 caracteres" /><button type="button" onClick={() => setVisible((current) => !current)} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible}>{visible ? <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2"><path d="m3 3 18 18" /><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" /><path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.8 4.3 9.8 7.1a1.7 1.7 0 0 1 0 1.2 14.6 14.6 0 0 1-3.2 4.6" /><path d="M6.2 6.2A14.6 14.6 0 0 0 2.2 11a1.7 1.7 0 0 0 0 1.2C3.2 15 7 19.3 12 19.3c1.1 0 2.2-.2 3.1-.6" /></svg> : <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2"><path d="M2.2 12c1-2.8 4.8-7.1 9.8-7.1s8.8 4.3 9.8 7.1a1.7 1.7 0 0 1 0 1.2c-1 2.8-4.8 7.1-9.8 7.1s-8.8-4.3-9.8-7.1a1.7 1.7 0 0 1 0-1.2Z" /><circle cx="12" cy="12" r="3" /></svg>}</button></div></label>;
}
