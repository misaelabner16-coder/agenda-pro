"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  ["Início", "/dashboard"],
  ["Agenda", "/dashboard/agenda"],
  ["Clientes", "/dashboard/clientes"],
  ["Serviços", "/dashboard/servicos"],
  ["Horários", "/dashboard/horarios"],
  ["Ajustes", "/dashboard/configuracoes"],
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
  return (
    <nav aria-label="Navegação do painel" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-stone-200 bg-white/95 px-1 pb-[max(.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-10px_30px_-20px_rgb(16_40_41_/_0.45)] backdrop-blur lg:static lg:grid-cols-1 lg:border-0 lg:bg-transparent lg:p-4 lg:shadow-none">
      {navigation.map(([label, href], index) => {
        const active = pathname === href;
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[3.8rem] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-[10px] font-semibold leading-none lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-sm ${active ? "bg-emerald-100 text-emerald-950" : "text-stone-500 hover:bg-stone-100 hover:text-emerald-950 lg:text-stone-200 lg:hover:bg-white/10 lg:hover:text-white"}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-5 shrink-0"><path d={iconPaths[index]} /></svg><span>{label}</span></Link>;
      })}
      {isAdmin && <Link href="/admin" className="hidden rounded-xl px-4 py-3 text-center text-xs font-semibold text-gold-300 hover:bg-white/10 lg:mt-6 lg:block lg:text-left">Administração global ↗</Link>}
    </nav>
  );
}
