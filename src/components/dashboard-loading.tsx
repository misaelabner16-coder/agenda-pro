export function DashboardLoading({ title }: { title: string }) {
  return (
    <section aria-busy="true" aria-label={`Carregando ${title.toLowerCase()}`} className="animate-pulse motion-reduce:animate-none">
      <p className="text-sm font-semibold text-emerald-700">{title}</p>
      <div className="mt-2 h-9 w-64 max-w-full rounded-lg bg-stone-200" />
      <div className="mt-3 h-5 w-80 max-w-full rounded bg-stone-200" />
      <div className="mt-8 space-y-3 rounded-2xl bg-white p-5 shadow-sm">
        <div className="h-16 rounded-xl bg-stone-100" />
        <div className="h-16 rounded-xl bg-stone-100" />
        <div className="h-16 rounded-xl bg-stone-100" />
      </div>
      <span className="sr-only">Carregando {title.toLowerCase()}...</span>
    </section>
  );
}
