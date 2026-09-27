import Link from "next/link";
import { PasswordField } from "@/components/password-field";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type Props = {
  reset?: boolean;
  error?: string;
  message?: string;
  action: (formData: FormData) => Promise<void>;
};

export function PasswordRecoveryCard({ reset, error, message, action }: Props) {
  return <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
    <section className="premium-surface w-full max-w-md rounded-3xl bg-white p-6 sm:p-8">
      <Link href="/" className="mb-8 inline-flex items-center gap-2.5 text-lg font-bold"><span className="grid size-9 place-items-center rounded-xl bg-emerald-950 text-sm text-gold-300">A</span>Ammali</Link>
      <div className="mb-5 h-0.5 w-12 rounded-full bg-gold-400" />
      <h1 className="text-2xl font-bold tracking-tight">{reset ? "Crie uma nova senha" : "Esqueceu sua senha?"}</h1>
      <p className="mt-2 text-stone-600">{reset ? "Escolha uma senha forte e diferente da anterior." : "Informe o e-mail da sua conta. Enviaremos um link para você recuperar o acesso."}</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
      <form action={action} className="mt-6 space-y-4">
        {reset ? <>
          <PasswordField autoComplete="new-password" label="Nova senha" />
          <PasswordField autoComplete="new-password" label="Confirmar nova senha" name="password_confirmation" />
        </> : <label className="block text-sm font-semibold">E-mail<input required type="email" name="email" maxLength={254} autoComplete="email" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="voce@exemplo.com" /></label>}
        <PendingSubmitButton idleLabel={reset ? "Salvar nova senha" : "Enviar link de recuperação"} pendingLabel={reset ? "Salvando..." : "Enviando..."} className="w-full rounded-xl bg-emerald-950 px-4 py-3 font-semibold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60" />
      </form>
      {!reset && <p className="mt-4 text-xs leading-relaxed text-stone-500">Abra o link no mesmo navegador em que fez o pedido. Se não receber, confira o spam e aguarde pelo menos 60 segundos antes de tentar novamente.</p>}
      <Link href="/login" className="mt-6 block rounded-lg py-2 text-center text-sm font-semibold text-emerald-700 hover:underline">Voltar para entrar</Link>
    </section>
  </main>;
}
