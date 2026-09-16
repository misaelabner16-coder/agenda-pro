import Link from "next/link";

type Props = {
  mode: "login" | "signup";
  error?: string;
  message?: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function AuthCard({ mode, error, message, action }: Props) {
  const isLogin = mode === "login";
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl shadow-stone-200/70 sm:p-8">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-lg font-bold"><span className="grid size-8 place-items-center rounded-xl bg-emerald-600 text-sm text-white">A</span>Agenda Pro</Link>
        <h1 className="text-2xl font-bold tracking-tight">{isLogin ? "Entre na sua conta" : "Crie sua agenda"}</h1>
        <p className="mt-2 text-stone-600">{isLogin ? "Acesse sua agenda e seus próximos atendimentos." : "Você configura seu estabelecimento em poucos minutos."}</p>
        {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
        <form action={action} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">E-mail<input required type="email" name="email" autoComplete="email" className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="voce@exemplo.com" /></label>
          <label className="block text-sm font-semibold">Senha<input required minLength={8} type="password" name="password" autoComplete={isLogin ? "current-password" : "new-password"} className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-3 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="Mínimo de 8 caracteres" /></label>
          <button className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700">{isLogin ? "Entrar" : "Criar conta"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-stone-600">{isLogin ? "Ainda não tem uma conta?" : "Já possui uma conta?"} <Link className="font-semibold text-emerald-700 hover:underline" href={isLogin ? "/cadastro" : "/login"}>{isLogin ? "Criar agenda" : "Entrar"}</Link></p>
      </section>
    </main>
  );
}
