const productionDatabase = "https://nuhxuhkunhuzljjjkzbx.supabase.co";
const retiredDatabase = "https://tjxhohypuqjnlnbgstvy.supabase.co";

export function assertEnvironmentDatabase(environment?: string, url?: string, allowProductionTest = false) {
  const normalized = url?.replace(/\/$/, "");
  if (normalized === retiredDatabase) throw new Error("Ambiente bloqueado: o banco antigo do Canadá foi aposentado.");
  if (environment === "production" && normalized !== productionDatabase) throw new Error("Publicação bloqueada: use o Supabase de São Paulo.");
  if (environment === "preview" && normalized === productionDatabase) throw new Error("Preview bloqueado: configure um projeto Supabase separado de produção.");
  if (environment !== "production" && environment !== "preview" && normalized === productionDatabase && !allowProductionTest) throw new Error("Acesso local à produção bloqueado. Use um projeto de testes ou autorização explícita temporária.");
}

export function validatedSiteOrigin(value: string | undefined, production: boolean) {
  const parsed = new URL(value || (production ? "" : "http://localhost:3000"));
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/"
      || parsed.hostname.endsWith(".supabase.co") || !["https:", "http:"].includes(parsed.protocol)
      || (production && parsed.protocol !== "https:")) throw new Error("Configure a URL pública da aplicação, não a URL do Supabase.");
  return parsed.origin;
}
