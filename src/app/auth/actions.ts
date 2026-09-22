"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

export async function signIn(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha inválidos.")}`);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  if (password.length < 8) redirect(`/cadastro?erro=${encodeURIComponent("Use uma senha com pelo menos 8 caracteres.")}`);
  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
  });
  if (error) {
    console.error("[auth] Falha no cadastro.", { code: error.code, status: error.status });
    const message = error.code === "user_already_exists"
      ? "Este e-mail já está cadastrado. Entre com sua senha."
      : "Não foi possível criar a conta agora. Confira os dados e tente novamente.";
    redirect(`/cadastro?erro=${encodeURIComponent(message)}`);
  }
  if (data.user && data.user.identities?.length === 0) {
    redirect(`/login?erro=${encodeURIComponent("Este e-mail já está cadastrado. Entre com sua senha.")}`);
  }
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }
  redirect(`/login?confirmacao=1&email=${encodeURIComponent(email)}&mensagem=${encodeURIComponent("Conta criada. Enviamos um link de confirmação para seu e-mail. Confirme o endereço antes de entrar.")}`);
}

export async function resendConfirmation(formData: FormData) {
  const email = value(formData, "email");
  if (!/^\S+@\S+\.\S+$/.test(email)) redirect(`/login?erro=${encodeURIComponent("Informe um e-mail válido para reenviar a confirmação.")}`);
  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` } });
  if (error) {
    console.error("[auth] Falha ao reenviar confirmação.", { code: error.code, status: error.status });
    const message = error.code === "over_email_send_rate_limit"
      ? "Aguarde alguns minutos antes de solicitar outro e-mail."
      : "Não foi possível reenviar o e-mail agora.";
    redirect(`/login?confirmacao=1&email=${encodeURIComponent(email)}&erro=${encodeURIComponent(message)}`);
  }
  redirect(`/login?confirmacao=1&email=${encodeURIComponent(email)}&mensagem=${encodeURIComponent("E-mail de confirmação reenviado. Verifique também a caixa de spam.")}`);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
