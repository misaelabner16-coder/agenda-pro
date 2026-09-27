export function safeInternalPath(value: string | null, fallback = "/onboarding") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const parsed = new URL(value, "https://internal.invalid");
    return parsed.origin === "https://internal.invalid" ? parsed.pathname + parsed.search + parsed.hash : fallback;
  } catch { return fallback; }
}

export const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const validToken = (value: string) => /^[a-f0-9]{64}$/i.test(value);
export const validSlug = (value: string) => value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validClock = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function validInstant(value: string) {
  return /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && validDate(value.slice(0, 10)) && Number.isFinite(new Date(value).valueOf());
}
export function passwordValue(formData: FormData) {
  const value = formData.get("password");
  return typeof value === "string" ? value : ""; // Never trim or normalize a password.
}

export class PublicInputError extends Error {
  status: number;
  constructor(status: number, message = "Dados inválidos.") { super(message); this.status = status; }
}

export async function readPublicJson(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new PublicInputError(403, "Origem não permitida.");
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new PublicInputError(415);
  const limit = 8192;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) throw new PublicInputError(413, "Formulário muito grande.");
  const reader = request.body?.getReader();
  if (!reader) throw new PublicInputError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new PublicInputError(413, "Formulário muito grande."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new PublicInputError(400);
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PublicInputError) throw error;
    throw new PublicInputError(400);
  } finally { reader.releaseLock(); }
}

export const privateResponseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };

export function browserSecurityHeaders(nonce: string, development: boolean, supabaseUrl?: string) {
  if (!/^[a-zA-Z0-9+/=_-]{20,}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  let apiOrigin = "";
  try {
    const api = new URL(supabaseUrl ?? "");
    if (api.protocol === "https:" && /^[a-z0-9]+\.supabase\.co$/.test(api.hostname)) apiOrigin = api.origin;
  } catch { /* No configured browser API origin. */ }
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing calendar uses style attributes for positions; no unsafe inline scripts.
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
    `connect-src 'self' ${apiOrigin}${development ? " ws: wss:" : ""}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  return {
    "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer", "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
