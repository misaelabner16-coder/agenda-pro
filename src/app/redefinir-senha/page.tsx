import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordRecoveryCard } from "@/components/password-recovery-card";
import { resetPassword } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { expiredRecoveryMessage } from "@/lib/password-recovery";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(`/recuperar-senha?erro=${encodeURIComponent(expiredRecoveryMessage)}`);
  const params = await searchParams;
  return <PasswordRecoveryCard reset action={resetPassword} error={params.erro} />;
}
