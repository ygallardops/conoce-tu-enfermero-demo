import { env } from "cloudflare:workers";
import { queryPublicRegistry } from "@/lib/padron";
import { validateConsultaPayload } from "@/lib/consulta.mjs";
import { readRequestJson, RequestPayloadError } from "@/lib/http-request.mjs";

const TURNSTILE_TIMEOUT_MS = 5_000;

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  };
}

type TurnstileOutcome = "valid" | "invalid" | "unavailable";

async function verifyTurnstile(token: string, request: Request): Promise<TurnstileOutcome> {
  const runtimeEnv = env as typeof env & {
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_EXPECTED_HOSTNAME?: string;
    TURNSTILE_EXPECTED_ACTION?: string;
  };
  const secret = runtimeEnv.TURNSTILE_SECRET_KEY;
  const expectedHostname = runtimeEnv.TURNSTILE_EXPECTED_HOSTNAME;
  const expectedAction = runtimeEnv.TURNSTILE_EXPECTED_ACTION;
  if (!secret || !expectedHostname || !expectedAction) return "unavailable";

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    if (!response.ok) return "unavailable";
    const result = (await response.json()) as { success?: boolean; hostname?: string; action?: string };
    if (result.success !== true) return "invalid";
    return result.hostname === expectedHostname && result.action === expectedAction ? "valid" : "invalid";
  } catch {
    return "unavailable";
  }
}

function errorResponse(requestId: string, status: number, message: string) {
  return Response.json(
    { request_id: requestId, error: { message } },
    { status, headers: responseHeaders(requestId) },
  );
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: unknown;

  try {
    body = await readRequestJson(request);
  } catch (error) {
    if (error instanceof RequestPayloadError) return errorResponse(requestId, error.status, error.message);
    return errorResponse(requestId, 400, "El formato de la consulta no es válido.");
  }

  const validation = validateConsultaPayload(body);
  if (!validation.ok) {
    return errorResponse(requestId, 400, validation.message);
  }

  const turnstileToken = (body as { turnstile_token: string }).turnstile_token;
  const turnstileOutcome = await verifyTurnstile(turnstileToken, request);
  if (turnstileOutcome === "unavailable") {
    return errorResponse(requestId, 503, "La verificación no está disponible en este momento. Inténtalo nuevamente.");
  }
  if (turnstileOutcome !== "valid") {
    return errorResponse(requestId, 403, "No fue posible validar la consulta. Inténtalo nuevamente.");
  }

  try {
    const queryResult = await queryPublicRegistry(env.DB, validation.value);
    if (!queryResult) throw new Error("No existe un snapshot activo.");

    return Response.json(
      {
        request_id: requestId,
        resultados: queryResult.records,
        total: queryResult.records.length,
        datos_actualizados_al: queryResult.generatedAt,
      },
      { headers: responseHeaders(requestId) },
    );
  } catch {
    // Do not include query contents or internal database details in a response.
    return errorResponse(requestId, 503, "La consulta no está disponible en este momento. Inténtalo nuevamente.");
  }
}

export function GET() {
  const requestId = crypto.randomUUID();
  return new Response(null, {
    status: 405,
    headers: { ...responseHeaders(requestId), allow: "POST" },
  });
}
