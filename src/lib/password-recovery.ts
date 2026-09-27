import { passwordValue, validEmail } from "./web-security.ts";

type AuthError = { code?: string; status?: number } | null;
type RecoveryAuth = {
  resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: AuthError }>;
  getUser: () => Promise<{ data: { user: { id: string } | null }; error: AuthError }>;
  updateUser: (attributes: { password: string }) => Promise<{ error: AuthError }>;
  signOut: (options: { scope: "global" }) => Promise<{ error: AuthError }>;
};

export const recoveryMessage = "Se existir uma conta com este e-mail, você receberá um link para criar uma nova senha. Confira também o spam e abra o link neste mesmo navegador.";
export const expiredRecoveryMessage = "Seu link é inválido ou expirou. Solicite outro e abra-o no mesmo navegador em que fez o pedido.";

function logFailure(operation: string, error?: AuthError) {
  // Never log email addresses, password values, tokens or raw provider errors.
  console.error(`[auth] ${operation}`, { code: error?.code, status: error?.status });
}

export async function requestRecovery(auth: Pick<RecoveryAuth, "resetPasswordForEmail">, email: string, origin: string) {
  if (!validEmail(email)) return { error: "Informe um e-mail válido." };
  try {
    const { error } = await auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/confirm?next=/redefinir-senha`,
    });
    if (error) logFailure("Falha ao solicitar recuperação de senha.", error);
  } catch {
    logFailure("Serviço de recuperação de senha indisponível.");
  }
  // Rate limits/provider failures must not disclose account existence.
  return { message: recoveryMessage };
}

export async function changeRecoveredPassword(auth: Omit<RecoveryAuth, "resetPasswordForEmail">, form: FormData) {
  const password = passwordValue(form);
  if (password.length < 8 || password.length > 1024) return { error: "Use uma senha entre 8 e 1024 caracteres." };
  if (form.get("password_confirmation") !== password) return { error: "As senhas não coincidem." };
  try {
    // Validate against Auth, not an unverified cookie or client-supplied user ID.
    const { data, error } = await auth.getUser();
    if (error || !data.user) return { expired: true, error: expiredRecoveryMessage };
    const updated = await auth.updateUser({ password });
    if (updated.error) {
      logFailure("Falha ao redefinir senha.", updated.error);
      if (updated.error.code === "same_password") return { error: "Escolha uma senha diferente da atual." };
      return { error: "Não foi possível alterar a senha. Use uma senha forte ou solicite um novo link." };
    }
  } catch {
    logFailure("Serviço de alteração de senha indisponível.");
    return { error: "Não foi possível alterar a senha agora. Tente novamente em alguns instantes." };
  }
  // Revoke refresh sessions after a successful change. Existing JWTs expire normally.
  try {
    const { error } = await auth.signOut({ scope: "global" });
    if (error) logFailure("Falha ao encerrar sessões após alteração de senha.", error);
  } catch { logFailure("Falha ao encerrar sessões após alteração de senha."); }
  return { success: true };
}
