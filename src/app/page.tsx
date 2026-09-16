import Link from "next/link";

const features = [
  ["Agenda sempre organizada", "Visualize o dia, bloqueie períodos e acompanhe cada atendimento."],
  ["Link para seus clientes", "Compartilhe uma página simples para seus clientes escolherem serviço, data e horário."],
  ["Sem horários duplicados", "A agenda confere a disponibilidade antes de confirmar cada reserva."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="flex items-center gap-2 text-lg font-bold tracking-tight" href="/">
          <span className="grid size-8 place-items-center rounded-xl bg-emerald-600 text-sm text-white">A</span>
          Agenda Pro
        </Link>
        <div className="flex items-center gap-3">
          <Link className="hidden text-sm font-medium text-stone-600 sm:block" href="/login">Entrar</Link>
          <Link className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm" href="/cadastro">Criar agenda</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 sm:px-8 md:grid-cols-[1.05fr_.95fr] md:items-center md:py-24">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">Feito para pequenos negócios</p>
          <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">Sua agenda online, simples de usar.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-stone-600">Organize os horários da sua barbearia e deixe seus clientes agendarem sozinhos, pelo celular.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="rounded-xl bg-emerald-600 px-5 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-emerald-700" href="/cadastro">Começar agora</Link>
            <Link className="rounded-xl border border-stone-200 bg-white px-5 py-3 text-center font-semibold text-stone-700 transition hover:border-stone-300" href="/cadastro">Criar minha página</Link>
          </div>
          <p className="mt-4 text-sm text-stone-500">Sem pagamentos, contratos ou integrações neste MVP.</p>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-xl shadow-stone-200/60 sm:p-6">
          <div className="rounded-2xl bg-stone-900 p-5 text-white">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-stone-400">Hoje, terça-feira</p><p className="mt-1 text-xl font-semibold">Sua agenda</p></div>
              <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">3 atendimentos</span>
            </div>
            <div className="mt-5 space-y-3">
              {[['09:00', 'Corte masculino', 'Lucas M.'], ['11:30', 'Corte + barba', 'Rafael S.'], ['15:00', 'Corte masculino', 'André P.']].map(([time, service, client]) => (
                <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3" key={time}>
                  <span className="w-10 text-sm font-semibold text-emerald-300">{time}</span>
                  <div><p className="text-sm font-medium">{service}</p><p className="text-xs text-stone-400">{client}</p></div>
                </div>
              ))}
            </div>
          </div>
          <p className="px-2 pt-5 text-center text-sm font-medium text-stone-500">Tudo o que você precisa para começar.</p>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:grid-cols-3 sm:px-8">
          {features.map(([title, description]) => (
            <article key={title}>
              <span className="mb-4 grid size-10 place-items-center rounded-xl bg-emerald-50 font-bold text-emerald-700">✓</span>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 leading-7 text-stone-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
