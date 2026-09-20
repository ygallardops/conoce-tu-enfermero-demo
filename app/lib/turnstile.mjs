export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TIMEOUT_MS = 5_000;

export async function verifyTurnstile(token, config, fetchImpl = fetch) {
  const { secret, expectedHostname, expectedAction, remoteIp } = config;
  if (!secret || !expectedHostname || !expectedAction) return "unavailable";

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    if (!response.ok) return "unavailable";
    const result = await response.json();
    if (result.success !== true) return "invalid";
    return result.hostname === expectedHostname && result.action === expectedAction ? "valid" : "invalid";
  } catch {
    return "unavailable";
  }
}
