"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { passwordValue, validEmail } from "@/lib/web-security";
import { validatedSiteOrigin } from "@/lib/environment-security";

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

export async function signIn(formData: FormData) {
  const email = value(formData, "email");
  const password = passwordValue(formData);
  if (!validEmail(email) || password.length === 0 || password.length > 1024) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha inválidos.")}`);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha inválidos.")}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = value(formData, "email");
  const password = passwordValue(formData);
  if (!validEmail(email) || password.length > 1024) redirect(`/cadastro?erro=${encodeURIComponent("Revise o e-mail e a senha informados.")}`);
  if (password.length < 8) redirect(`/cadastro?erro=${encodeURIComponent("Use uma senha com pelo menos 8 caracteres.")}`);
  const supabase = await createSupabaseServerClient();
  const origin = validatedSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_ENV === "production");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
  });
  const confirmationMessage = "Se este e-mail puder ser cadastrado, você receberá um link de confirmação. Se já possui conta, entre com sua senha.";
  if (error?.code === "user_already_exists" || (data.user && data.user.identities?.length === 0)) {
    redirect(`/login?confirmacao=1&mensagem=${encodeURIComponent(confirmationMessage)}`);
  }
  if (error) {
    console.error("[auth] Falha no cadastro.", { code: error.code, status: error.status });
    const message = "Não foi possível criar a conta agora. Confira os dados e tente novamente.";
    redirect(`/cadastro?erro=${encodeURIComponent(message)}`);
  }
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }
  redirect(`/login?confirmacao=1&mensagem=${encodeURIComponent(confirmationMessage)}`);
}

export async function resendConfirmation(formData: FormData) {
  const email = value(formData, "email");
  if (!validEmail(email)) redirect(`/login?erro=${encodeURIComponent("Informe um e-mail válido para reenviar a confirmação.")}`);
  const supabase = await createSupabaseServerClient();
  const origin = validatedSiteOrigin(process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_ENV === "production");
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` } });
  if (error) {
    console.error("[auth] Falha ao reenviar confirmação.", { code: error.code, status: error.status });
    const message = error.code === "over_email_send_rate_limit"
      ? "Aguarde alguns minutos antes de solicitar outro e-mail."
      : "Não foi possível reenviar o e-mail agora.";
    if (error.code === "over_email_send_rate_limit") redirect(`/login?confirmacao=1&erro=${encodeURIComponent(message)}`);
  }
  redirect(`/login?confirmacao=1&mensagem=${encodeURIComponent("Se houver um cadastro pendente para este e-mail, você receberá a confirmação. Confira também o spam.")}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
