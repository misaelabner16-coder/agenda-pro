import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { currentUser, requireWorkspace } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const workspace = await requireWorkspace();
  const user = await currentUser();
  const supabase = await createSupabaseServerClient();
  const { data: admin } = await supabase.rpc("is_platform_admin");
  return (
    <div className="min-h-screen bg-stone-100 lg:pl-60">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4">Pular para conteúdo</a>
      <aside className="app-sidebar relative lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60 lg:overflow-y-auto">
        <Link href="/dashboard" className="flex w-fit items-center gap-3 px-6 py-4 text-lg font-bold tracking-tight lg:py-8 lg:text-xl"><span className="grid size-8 place-items-center rounded-xl bg-emerald-200 text-emerald-950 lg:size-9">A</span>Agenda Pro</Link>
        <p className="hidden px-8 pb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-300 lg:block">Seu negócio</p>
        <DashboardNav isAdmin={Boolean(admin)} />
        <p className="hidden px-8 pt-8 text-xs text-emerald-300 lg:block">Seu tempo, bem cuidado.</p>
      </aside>
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-4 sm:px-8">
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Estabelecimento</p><p className="truncate text-sm font-semibold">{workspace.location.name}</p></div>
        <div className="flex shrink-0 items-center gap-2"><a className="rounded-xl border border-stone-200 px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 sm:text-sm" href={`/p/${workspace.location.public_slug}`} target="_blank" rel="noopener noreferrer">Página do cliente ↗</a><form action={signOut}><button className="rounded-lg px-2 py-2.5 text-xs text-stone-600 hover:bg-stone-100">Sair</button></form></div>
      </header>
      <main id="conteudo" className="app-content mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-8 sm:py-8 lg:pb-8">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-24 text-xs text-stone-400 sm:px-6 lg:pb-8">Conta: {user?.email}</footer>
    </div>
  );
}
