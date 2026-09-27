"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { currentUser } from "@/modules/tenancy/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validEmail, validUuid } from "@/lib/web-security";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

async function requirePlatformAdmin() {
  const user = await currentUser();
  if (!user) throw new Error("Autenticação necessária.");
  const supabase = await createSupabaseServerClient();
  const { data: admin } = await supabase.rpc("is_platform_admin");
  if (!admin) throw new Error("Sem permissão de administrador global.");
  return supabase;
}

export async function addOrganizationAccess(_state: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email").toLowerCase();
  const organizationId = text(formData, "organization_id");
  const role = text(formData, "role");
  if (!validEmail(email) || !validUuid(organizationId) || !["owner", "manager", "receptionist", "professional"].includes(role)) return { error: "Revise o e-mail, a empresa e a função." };
  const supabase = await requirePlatformAdmin();
  const { error } = await supabase.rpc("grant_organization_access", {
    p_organization_id: organizationId,
    p_email: email,
    p_role: role,
  });
  if (error?.code === "P0002") return { error: "Confira a empresa e peça à pessoa para cadastrar e confirmar o e-mail antes de receber acesso." };
  if (error) return { error: "Não foi possível conceder o acesso." };
  revalidatePath("/admin");
  return { success: "Acesso concedido." };
}

export async function deactivateOrganizationAccess(_state: ActionState, formData: FormData): Promise<ActionState> {
  const membershipId = text(formData, "membership_id");
  if (!validUuid(membershipId)) return { error: "Selecione um acesso válido." };
  const supabase = await requirePlatformAdmin();
  const { error } = await supabase.from("organization_memberships").update({ is_active: false }).eq("id", membershipId);
  if (error) return { error: "Não foi possível remover o acesso." };
  revalidatePath("/admin");
  return { success: "Acesso removido. O histórico foi preservado." };
}
