import { env } from "cloudflare:workers";
import { queryPublicRegistry } from "@/lib/padron";
import { validateConsultaPayload } from "@/lib/consulta.mjs";
import { readRequestJson, RequestPayloadError } from "@/lib/http-request.mjs";
import { verifyTurnstile } from "@/lib/turnstile.mjs";

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  };
}

type TurnstileOutcome = "valid" | "invalid" | "unavailable";

function checkTurnstile(token: string, request: Request): Promise<TurnstileOutcome> {
  const runtimeEnv = env as typeof env & {
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_EXPECTED_HOSTNAME?: string;
    TURNSTILE_EXPECTED_ACTION?: string;
  };

  return verifyTurnstile(token, {
    secret: runtimeEnv.TURNSTILE_SECRET_KEY,
    expectedHostname: runtimeEnv.TURNSTILE_EXPECTED_HOSTNAME,
    expectedAction: runtimeEnv.TURNSTILE_EXPECTED_ACTION,
    remoteIp: request.headers.get("CF-Connecting-IP"),
  }) as Promise<TurnstileOutcome>;
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
  const turnstileOutcome = await checkTurnstile(turnstileToken, request);
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
