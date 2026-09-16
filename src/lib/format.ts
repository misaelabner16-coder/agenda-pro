export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatDateTime(value: string, timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export function formatTime(value: string, timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
}

export function priceToCents(rawValue: FormDataEntryValue | null): number {
  const typed = String(rawValue ?? "").trim().replace("R$", "").replace(/\s/g, "");
  const raw = typed.includes(",") ? typed.replace(/\./g, "").replace(",", ".") : typed;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error("Informe um preço válido.");
  return Math.round(value * 100);
}

export function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}
