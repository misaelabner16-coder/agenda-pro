import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Location, Organization, OrganizationMembership, Workspace } from "@/lib/types";

// React cache is scoped to the current render request; it never shares user data
// between requests or organizations.
export const currentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * The MVP has one active workspace per account. Memberships are already
 * modeled separately, so a future organization switcher only needs to choose
 * another membership instead of changing the data model.
 */
const workspaceForUser = cache(async (userId: string): Promise<Workspace | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, is_active, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at")
    .limit(20);
  if (membershipError) {
    console.error("[workspace] Falha ao consultar vínculos ativos.", { code: membershipError.code, message: membershipError.message });
    throw new Error("Não foi possível carregar o vínculo da conta.");
  }
  if (!memberships?.length) return null;

  const typedMemberships = memberships as unknown as OrganizationMembership[];
  const organizationIds = typedMemberships.map((membership) => membership.organization_id);
  const [{ data: organizations, error: organizationError }, { data: locations, error: locationError }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, is_active").in("id", organizationIds).eq("is_active", true),
    supabase.from("locations").select("id, organization_id, name, public_slug, time_zone, is_active, default_professional_id, created_at").in("organization_id", organizationIds).eq("is_active", true).order("created_at"),
  ]);
  if (organizationError || locationError) {
    console.error("[workspace] Falha ao consultar empresa/unidade.", {
      organizationCode: organizationError?.code,
      locationCode: locationError?.code,
    });
    throw new Error("Não foi possível carregar a empresa e a unidade.");
  }

  const organizationById = new Map((organizations ?? []).map((organization) => [organization.id, organization]));
  const firstLocationByOrganization = new Map<string, Location>();
  for (const rawLocation of locations ?? []) {
    const location = rawLocation as unknown as Location;
    if (!firstLocationByOrganization.has(location.organization_id)) firstLocationByOrganization.set(location.organization_id, location);
  }
  const typedMembership = typedMemberships.find((membership) => organizationById.has(membership.organization_id) && firstLocationByOrganization.has(membership.organization_id));
  if (!typedMembership) return null;
  const organization = organizationById.get(typedMembership.organization_id);
  const location = firstLocationByOrganization.get(typedMembership.organization_id);
  if (!organization || !location) return null;

  return {
    organization: organization as unknown as Organization,
    membership: typedMembership,
    location: location as unknown as Location,
  };
});

export async function currentWorkspace(): Promise<Workspace | null> {
  const user = await currentUser();
  return user ? workspaceForUser(user.id) : null;
}

export async function requireWorkspace(): Promise<Workspace> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const workspace = await workspaceForUser(user.id);
  if (!workspace) redirect("/onboarding");
  return workspace;
}
