import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { currentUser, requireWorkspace } from "@/modules/tenancy/workspace";

const navigation = [
  ["Visão geral", "/dashboard"],
  ["Serviços", "/dashboard/servicos"],
  ["Horários", "/dashboard/horarios"],
  ["Agenda", "/dashboard/agenda"],
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const workspace = await requireWorkspace();
  const user = await currentUser();
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-bold tracking-tight"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-600 text-sm text-white">A</span><span className="truncate">{workspace.location.name}</span></Link>
          <div className="flex items-center gap-3"><a className="hidden text-sm font-medium text-stone-600 sm:block" href={`/p/${workspace.location.public_slug}`} target="_blank">Ver página pública ↗</a><form action={signOut}><button className="rounded-lg px-2 py-1.5 text-sm font-semibold text-stone-600 hover:bg-stone-100">Sair</button></form></div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {navigation.map(([label, href]) => <Link key={href} href={href} className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900">{label}</Link>)}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-stone-400 sm:px-6">Conta: {user?.email}</footer>
    </div>
  );
}
