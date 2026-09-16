import { AuthCard } from "@/components/auth-card";
import { signUp } from "@/app/auth/actions";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const params = await searchParams;
  return <AuthCard mode="signup" action={signUp} error={params.erro} />;
}
