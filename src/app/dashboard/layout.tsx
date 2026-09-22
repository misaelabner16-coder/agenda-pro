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
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-emerald-800 bg-emerald-950 text-white shadow-lg shadow-emerald-950/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3 font-bold tracking-tight"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-gold-300/60 bg-white/10 text-sm text-gold-300">A</span><span className="truncate">{workspace.location.name}</span></Link>
          <div className="flex items-center gap-2 sm:gap-3"><a className="hidden rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:border-gold-300 hover:bg-white/10 sm:block" href={`/p/${workspace.location.public_slug}`} target="_blank" rel="noopener noreferrer">Ver página pública ↗</a><form action={signOut}><button className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-200 hover:bg-white/10 hover:text-white">Sair</button></form></div>
        </div>
        <DashboardNav isAdmin={Boolean(admin)} />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-stone-400 sm:px-6">Conta: {user?.email}</footer>
    </div>
  );
}
