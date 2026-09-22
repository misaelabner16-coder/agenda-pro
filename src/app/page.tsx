import Link from "next/link";

const features = [
  ["Agenda sempre organizada", "Visualize o dia, bloqueie períodos e acompanhe cada atendimento."],
  ["Link para seus clientes", "Compartilhe uma página simples para seus clientes escolherem serviço, data e horário."],
  ["Sem horários duplicados", "A agenda confere a disponibilidade antes de confirmar cada reserva."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <div className="relative overflow-hidden bg-emerald-950 text-white">
      <div aria-hidden="true" className="premium-grid pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-56 size-[32rem] rounded-full bg-emerald-500/20 blur-3xl" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8 sm:py-6">
        <Link className="flex shrink-0 items-center gap-2.5 text-lg font-bold tracking-tight" href="/">
          <span className="grid size-9 place-items-center rounded-xl border border-gold-300/60 bg-white/10 text-sm text-gold-300">A</span>
          Agenda Pro
        </Link>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link className="rounded-xl border border-white/35 bg-white/5 px-3.5 py-2.5 text-sm font-semibold text-white hover:border-gold-300 hover:bg-white/10 sm:px-5" href="/login">Entrar</Link>
          <Link className="hidden rounded-xl bg-gold-300 px-3.5 py-2.5 text-sm font-bold text-emerald-950 shadow-lg shadow-black/10 hover:bg-gold-100 sm:inline-flex sm:px-5" href="/cadastro">Criar agenda</Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-18 pt-14 sm:px-8 md:grid-cols-[1.05fr_.95fr] md:items-center md:gap-14 md:py-24">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold-300/30 bg-gold-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.17em] text-gold-300"><span className="size-1.5 rounded-full bg-gold-300" /> Feito para pequenos negócios</p>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">Uma agenda à altura do seu negócio.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-stone-200">Organize seus horários em um só lugar e ofereça aos clientes uma experiência de agendamento simples, a qualquer hora.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link className="rounded-xl bg-gold-300 px-6 py-3.5 text-center font-bold text-emerald-950 shadow-lg shadow-black/10 hover:bg-gold-100" href="/cadastro">Criar minha agenda <span aria-hidden="true">→</span></Link>
            <Link className="rounded-xl border border-white/25 px-6 py-3.5 text-center font-semibold text-white hover:border-white/50 hover:bg-white/10" href="/login">Já tenho uma conta</Link>
          </div>
          <p className="mt-5 text-sm text-stone-300">Crie sua conta, configure seus serviços e compartilhe seu link.</p>
        </div>

        <div className="rounded-3xl border border-white/15 bg-white/10 p-3 shadow-2xl shadow-black/25 backdrop-blur-sm sm:p-5">
          <div className="rounded-2xl bg-white p-5 text-emerald-950 shadow-xl shadow-black/10 sm:p-6">
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-medium text-stone-500">Hoje, terça-feira</p><p className="mt-1 text-xl font-bold">Sua agenda</p></div>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">3 atendimentos</span>
            </div>
            <div className="mt-5 space-y-3">
              {[['09:00', 'Corte masculino', 'Lucas M.'], ['11:30', 'Corte + barba', 'Rafael S.'], ['15:00', 'Corte masculino', 'André P.']].map(([time, service, client]) => (
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3" key={time}>
                  <span className="w-12 border-r border-gold-300 text-sm font-bold text-emerald-700">{time}</span>
                  <div><p className="text-sm font-semibold">{service}</p><p className="text-xs text-stone-500">{client}</p></div>
                </div>
              ))}
            </div>
          </div>
          <p className="px-2 pt-4 text-center text-sm font-medium text-stone-200">Mais clareza para você. Mais praticidade para seu cliente.</p>
        </div>
      </section>
      </div>

      <section className="border-y border-stone-200 bg-stone-50">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-16 sm:grid-cols-3 sm:px-8">
          {features.map(([title, description]) => (
            <article className="premium-surface rounded-2xl bg-white p-6" key={title}>
              <span className="mb-5 grid size-10 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-700">✓</span>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-stone-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
