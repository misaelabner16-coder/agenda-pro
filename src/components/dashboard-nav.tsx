"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  ["Visão geral", "/dashboard"],
  ["Agenda", "/dashboard/agenda"],
  ["Clientes", "/dashboard/clientes"],
  ["Serviços", "/dashboard/servicos"],
  ["Horários", "/dashboard/horarios"],
  ["Configurações", "/dashboard/configuracoes"],
];
const iconPaths = [
  "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  "M8 2v4 M16 2v4 M3 10h18 M3 5h18v16H3z M7 14h3 M14 14h3",
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4",
  "M4 6h16 M4 12h16 M4 18h16",
  "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <><button type="button" aria-expanded={open} aria-controls="dashboard-navigation" onClick={() => setOpen(!open)} className="absolute right-4 top-4 flex min-h-11 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold lg:hidden"><span aria-hidden="true">{open ? "×" : "☰"}</span>{open ? "Fechar" : "Menu"}</button>
    <nav id="dashboard-navigation" aria-label="Navegação do painel" className={`${open ? "grid" : "hidden"} grid-cols-3 gap-1 p-3 lg:grid lg:grid-cols-1 lg:p-4`}>
      {navigation.map(([label, href], index) => {
        const active = pathname === href;
        return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-semibold lg:justify-start lg:px-4 lg:text-sm ${active ? "bg-emerald-100 text-emerald-950" : "text-stone-200 hover:bg-white/10 hover:text-white"}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="hidden size-5 shrink-0 lg:block"><path d={iconPaths[index]} /></svg>{label}</Link>;
      })}
      {isAdmin && <Link href="/admin" className="col-span-3 rounded-xl px-4 py-3 text-center text-xs font-semibold text-gold-300 hover:bg-white/10 lg:col-span-1 lg:mt-6 lg:text-left">Administração global ↗</Link>}
    </nav></>
  );
}
