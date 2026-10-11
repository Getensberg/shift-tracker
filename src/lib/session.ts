// Простая авторизация админки: один пароль из env, cookie с HMAC-подписью.
// Работает и в middleware (edge), и в node — через Web Crypto.

export const SESSION_COOKIE = "st_session";

async function hmac(data: string): Promise<string> {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Токен сессии меняется при смене пароля — старые сессии автоматически недействительны. */
export function sessionToken() {
  return hmac(`admin:${process.env.ADMIN_PASSWORD ?? ""}`);
}

export async function isValidSession(value: string | undefined) {
  if (!value || !process.env.ADMIN_PASSWORD) return false;
  return value === (await sessionToken());
}
