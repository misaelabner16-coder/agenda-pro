import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Location, Organization, OrganizationMembership, Professional, Workspace } from "@/lib/types";

export async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * The MVP has one active workspace per account. Memberships are already
 * modeled separately, so a future organization switcher only needs to choose
 * another membership instead of changing the data model.
 */
export async function currentWorkspace(): Promise<Workspace | null> {
  const user = await currentUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, is_active, created_at")
    .eq("user_id", user.id)
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

  const typedLocation = location as unknown as Location;
  let defaultProfessional: Professional | null = null;
  if (typedLocation.default_professional_id) {
    const { data } = await supabase
      .from("professionals")
      .select("id, organization_id, user_id, display_name, is_active")
      .eq("id", typedLocation.default_professional_id)
      .maybeSingle();
    defaultProfessional = data as unknown as Professional | null;
  }

  return {
    organization: organization as unknown as Organization,
    membership: typedMembership,
    location: typedLocation,
    defaultProfessional,
  };
}

export async function requireWorkspace(): Promise<Workspace> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const workspace = await currentWorkspace();
  if (!workspace) redirect("/onboarding");
  return workspace;
}
