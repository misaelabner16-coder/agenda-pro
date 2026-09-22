"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  ["Visão geral", "/dashboard"],
  ["Serviços", "/dashboard/servicos"],
  ["Horários", "/dashboard/horarios"],
  ["Agenda", "/dashboard/agenda"],
  ["Clientes", "/dashboard/clientes"],
  ["Configurações", "/dashboard/configuracoes"],
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação do painel" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
      {navigation.map(([label, href]) => {
        const active = pathname === href;
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`shrink-0 rounded-lg px-3.5 py-2.5 text-sm font-semibold ${active ? "bg-white/15 text-white shadow-sm ring-1 ring-white/15" : "text-stone-300 hover:bg-white/10 hover:text-white"}`}>{label}</Link>;
      })}
      {isAdmin && <Link href="/admin" className="shrink-0 rounded-lg px-3.5 py-2.5 text-sm font-semibold text-gold-300 hover:bg-white/10">ADM</Link>}
    </nav>
  );
}
