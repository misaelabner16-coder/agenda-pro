const productionDatabase = "https://nuhxuhkunhuzljjjkzbx.supabase.co";
const testDatabase = "https://dbtxikkhzmqstuiudxko.supabase.co";
const retiredDatabase = "https://tjxhohypuqjnlnbgstvy.supabase.co";

export function assertEnvironmentDatabase(environment?: string, url?: string, allowProductionTest = false) {
  const normalized = url?.replace(/\/$/, "");
  if (normalized === retiredDatabase) throw new Error("Ambiente bloqueado: o banco antigo do Canadá foi aposentado.");
  if (environment === "production" && normalized !== productionDatabase) throw new Error("Publicação bloqueada: use o Supabase de São Paulo.");
  if (environment === "preview" && normalized !== testDatabase) throw new Error("Preview bloqueado: use exclusivamente o projeto Ammali Testes.");
  if (environment !== "production" && environment !== "preview" && normalized === productionDatabase && !allowProductionTest) throw new Error("Acesso local à produção bloqueado. Use um projeto de testes ou autorização explícita temporária.");
}

export function validatedSiteOrigin(value: string | undefined, production: boolean) {
  const parsed = new URL(value || (production ? "" : "http://localhost:3000"));
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/"
      || parsed.hostname.endsWith(".supabase.co") || !["https:", "http:"].includes(parsed.protocol)
      || (production && parsed.protocol !== "https:")) throw new Error("Configure a URL pública da aplicação, não a URL do Supabase.");
  return parsed.origin;
}

export function canonicalAuthDestination(requestUrl: string, siteOrigin: string | undefined, environment?: string) {
  if (environment !== "production" || !siteOrigin) return null;
  const request = new URL(requestUrl);
  const allowedHosts = ["agenda-pro-lovat.vercel.app", "www.ammaligestao.com", "ammaligestao.com"];
  // Leave old callback URLs on their original host: PKCE cookies cannot cross domains.
  if (!allowedHosts.includes(request.hostname) || !["/", "/login", "/cadastro", "/recuperar-senha"].includes(request.pathname)) return null;
  const canonical = validatedSiteOrigin(siteOrigin, true);
  if (!allowedHosts.includes(new URL(canonical).hostname) || request.origin === canonical) return null;
  return new URL(request.pathname, canonical).href; // Do not forward arbitrary query parameters.
}
