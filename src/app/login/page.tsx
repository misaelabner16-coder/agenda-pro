import { AuthCard } from "@/components/auth-card";
import { signIn } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string }> }) {
  const params = await searchParams;
  return <AuthCard mode="login" action={signIn} error={params.erro} message={params.mensagem} />;
}
