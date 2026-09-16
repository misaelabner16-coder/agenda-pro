import { currentUser, currentWorkspace, requireWorkspace } from "@/modules/tenancy/workspace";

// Compatibility exports for the current route structure. New modules should
// import from modules/tenancy/workspace directly.
export { currentUser, currentWorkspace, requireWorkspace };

export async function currentBusiness() {
  return currentWorkspace();
}

export async function requireBusiness() {
  return requireWorkspace();
}
