import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { addOrganizationAccess, deactivateOrganizationAccess } from "@/app/admin/actions";
import { currentUser } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrganizationRow = { id: string; name: string; is_active: boolean };
type MembershipRow = { id: string; organization_id: string; user_id: string; role: string; is_active: boolean };
type ProfileRow = { id: string; email: string | null; full_name: string | null };
type CustomerRow = { id: string; organization_id: string; name: string; phone: string; is_fixed: boolean };

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: admin } = await supabase.rpc("is_platform_admin");
  if (!admin) redirect("/dashboard");
  const [{ data: organizations }, { data: memberships }, { data: profiles }, { data: customers }] = await Promise.all([
    supabase.from("organizations").select("id, name, is_active").order("name"),
    supabase.from("organization_memberships").select("id, organization_id, user_id, role, is_active").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, email, full_name").order("email"),
    supabase.from("customers").select("id, organization_id, name, phone, is_fixed").order("created_at", { ascending: false }).limit(100),
  ]);
  const orgs = (organizations ?? []) as OrganizationRow[];
  const people = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const orgNames = new Map(orgs.map((organization) => [organization.id, organization.name]));
  return <main className="min-h-screen bg-stone-100 px-4 py-8 sm:px-6"><div className="mx-auto max-w-6xl"><p className="text-sm font-semibold text-emerald-700">Administração global</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Empresas, acessos e clientes</h1><p className="mt-2 text-stone-600">Ações aqui afetam a plataforma inteira. Remover acesso não apaga contas ou histórico.</p><div className="mt-8 grid gap-8 lg:grid-cols-[23rem_minmax(0,1fr)]"><section className="h-fit rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Conceder acesso</h2><p className="mt-1 text-sm text-stone-500">A pessoa deve criar sua conta antes.</p><ActionForm action={addOrganizationAccess} className="mt-5 space-y-4"><label className="block text-sm font-semibold">E-mail<input required name="email" type="email" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2.5" /></label><label className="block text-sm font-semibold">Empresa<select required name="organization_id" className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5"><option value="">Selecione</option>{orgs.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label className="block text-sm font-semibold">Função<select name="role" defaultValue="professional" className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5"><option value="owner">Proprietário</option><option value="manager">Gerente</option><option value="receptionist">Recepção</option><option value="professional">Profissional</option></select></label><button className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white">Adicionar acesso</button></ActionForm></section><div className="space-y-8"><section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="border-b border-stone-100 p-5"><h2 className="font-bold">Acessos por empresa</h2></div><div className="divide-y divide-stone-100">{((memberships ?? []) as MembershipRow[]).map((membership) => { const person = people.get(membership.user_id); return <article className="flex flex-wrap items-center justify-between gap-3 p-4" key={membership.id}><div><p className="font-semibold">{person?.full_name || person?.email || "Conta"}</p><p className="text-sm text-stone-500">{orgNames.get(membership.organization_id)} · {membership.role}</p></div>{membership.is_active ? <ActionForm action={deactivateOrganizationAccess}><input type="hidden" name="membership_id" value={membership.id} /><button className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remover acesso</button></ActionForm> : <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-600">Desativado</span>}</article>; })}</div></section><section className="overflow-hidden rounded-2xl bg-white shadow-sm"><div className="border-b border-stone-100 p-5"><h2 className="font-bold">Clientes cadastrados</h2></div><div className="divide-y divide-stone-100">{((customers ?? []) as CustomerRow[]).map((customer) => <article className="flex items-center justify-between gap-3 p-4" key={customer.id}><div><p className="font-semibold">{customer.name}</p><p className="text-sm text-stone-500">{orgNames.get(customer.organization_id)} · {customer.phone}</p></div>{customer.is_fixed && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Fixo</span>}</article>)}</div></section></div></div></div></main>;
}
