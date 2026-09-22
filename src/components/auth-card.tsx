import Link from "next/link";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { PasswordField } from "@/components/password-field";

type Props = {
  mode: "login" | "signup";
  error?: string;
  message?: string;
  action: (formData: FormData) => void | Promise<void>;
  resendAction?: (formData: FormData) => void | Promise<void>;
  confirmationEmail?: string;
};

export function AuthCard({ mode, error, message, action, resendAction, confirmationEmail }: Props) {
  const isLogin = mode === "login";
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-stone-100 px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-64 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-emerald-200/60 blur-3xl" />
      <section className="premium-surface relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8">
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5 text-lg font-bold"><span className="grid size-9 place-items-center rounded-xl bg-emerald-950 text-sm text-gold-300">A</span>Agenda Pro</Link>
        <div className="mb-5 h-0.5 w-12 rounded-full bg-gold-400" />
        <h1 className="text-2xl font-bold tracking-tight">{isLogin ? "Entre na sua conta" : "Crie sua agenda"}</h1>
        <p className="mt-2 text-stone-600">{isLogin ? "Acesse sua agenda e seus próximos atendimentos." : "Você configura seu estabelecimento em poucos minutos. Será necessário confirmar seu e-mail."}</p>
        {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
        <form action={action} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">E-mail<input required type="email" name="email" autoComplete="email" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="voce@exemplo.com" /></label>
          <PasswordField autoComplete={isLogin ? "current-password" : "new-password"} />
          <PendingSubmitButton idleLabel={isLogin ? "Entrar" : "Criar conta"} pendingLabel={isLogin ? "Entrando..." : "Criando conta..."} className="w-full rounded-xl bg-emerald-950 px-4 py-3 font-semibold text-white shadow-lg shadow-emerald-950/15 transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60" />
        </form>
        {isLogin && resendAction && <form action={resendAction} className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4"><p className="text-sm text-stone-600">Não recebeu a confirmação?</p><input required type="email" name="email" defaultValue={confirmationEmail} className="mt-3 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600" placeholder="voce@exemplo.com" /><PendingSubmitButton idleLabel="Reenviar e-mail" pendingLabel="Reenviando..." className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 disabled:cursor-wait disabled:opacity-60" /></form>}
        <p className="mt-6 text-center text-sm text-stone-600">{isLogin ? "Ainda não tem uma conta?" : "Já possui uma conta?"} <Link className="font-semibold text-emerald-700 hover:underline" href={isLogin ? "/cadastro" : "/login"}>{isLogin ? "Criar agenda" : "Entrar"}</Link></p>
      </section>
    </main>
  );
}
