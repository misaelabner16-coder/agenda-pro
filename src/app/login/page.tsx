import { AuthCard } from "@/components/auth-card";
import { resendConfirmation, signIn } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; confirmacao?: string; email?: string }> }) {
  const params = await searchParams;
  return <AuthCard mode="login" action={signIn} error={params.erro} message={params.mensagem} resendAction={params.confirmacao === "1" ? resendConfirmation : undefined} confirmationEmail={params.email} />;
}
