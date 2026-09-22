import Link from "next/link";
import { currentUser, currentWorkspace } from "@/modules/tenancy/workspace";
import { createBusiness } from "./actions";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (await currentWorkspace()) redirect("/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (isPlatformAdmin) redirect("/admin");
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl shadow-stone-200/70 sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold"><span className="grid size-8 place-items-center rounded-xl bg-emerald-600 text-sm text-white">A</span>Agenda Pro</Link>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[.16em] text-emerald-700">Primeiro passo</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Vamos criar sua agenda.</h1>
        <p className="mt-2 leading-7 text-stone-600">Essa conta ainda não está vinculada a uma agenda. Crie uma nova abaixo ou entre com a conta que já administra seu estabelecimento.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
          <span className="min-w-0 truncate">Conectado como: <strong className="text-stone-800">{user.email}</strong></span>
          <form action={signOut}><button className="font-semibold text-emerald-700 hover:text-emerald-800">Sair e trocar de conta</button></form>
        </div>
        {erro && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</p>}
        <form action={createBusiness} className="mt-6 space-y-5">
          <label className="block text-sm font-semibold">Nome do estabelecimento<input required name="name" minLength={2} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="Ex.: Barbearia do Misael" /></label>
          <label className="block text-sm font-semibold">Endereço da agenda<span className="mt-1.5 flex overflow-hidden rounded-xl border border-stone-300 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100"><span className="border-r border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-500">/p/</span><input required name="slug" minLength={3} pattern="[a-zA-Z0-9-]+" className="min-w-0 flex-1 px-3 py-3 outline-none" placeholder="barbearia-do-misael" /></span></label>
          <p className="text-sm leading-6 text-stone-500">Use letras, números e hífens. O fuso inicial será Brasil/São Paulo.</p>
          <PendingSubmitButton idleLabel="Criar minha agenda" pendingLabel="Criando sua agenda..." className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60" />
        </form>
      </section>
    </main>
  );
}
