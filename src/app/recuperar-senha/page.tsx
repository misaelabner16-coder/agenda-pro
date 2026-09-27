import type { Metadata } from "next";
import { PasswordRecoveryCard } from "@/components/password-recovery-card";
import { forgotPassword } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Recuperar senha", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string }> }) {
  const params = await searchParams;
  return <PasswordRecoveryCard action={forgotPassword} error={params.erro} message={params.mensagem} />;
}
