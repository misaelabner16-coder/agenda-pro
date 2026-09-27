"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/modules/tenancy/workspace";
import { slugify } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createBusiness(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  const requestedSlug = slugify(String(formData.get("slug") ?? ""));
  const slug = requestedSlug || slugify(name);
  if (name.length < 2 || name.length > 120 || slug.length < 3 || slug.length > 80) redirect(`/onboarding?erro=${encodeURIComponent("Use nome de 2 a 120 caracteres e endereço de 3 a 80 caracteres.")}`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_organization_with_location", {
    p_name: name,
    p_public_slug: slug,
    p_time_zone: "America/Sao_Paulo",
  });
  if (error?.code === "23505") redirect(`/onboarding?erro=${encodeURIComponent("Esse endereço já está em uso. Escolha outro.")}`);
  if (error?.code === "42501") redirect(`/login?erro=${encodeURIComponent("Sua sessão expirou. Entre novamente para criar a agenda.")}`);
  if (error) {
    console.error("[onboarding] Falha ao criar workspace.", { code: error.code });
    redirect(`/onboarding?erro=${encodeURIComponent("Não foi possível criar a agenda agora. Tente novamente em alguns instantes.")}`);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
