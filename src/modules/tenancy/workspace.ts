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
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, is_active, created_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const typedMembership = membership as unknown as OrganizationMembership;
  const [{ data: organization }, { data: location }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, is_active").eq("id", typedMembership.organization_id).eq("is_active", true).maybeSingle(),
    supabase.from("locations").select("id, organization_id, name, public_slug, time_zone, is_active, default_professional_id, created_at").eq("organization_id", typedMembership.organization_id).eq("is_active", true).order("created_at").limit(1).maybeSingle(),
  ]);
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
