import { env } from "cloudflare:workers";
import { ensureDemoSnapshot, queryPublicRegistry } from "@/lib/padron";
import { validateConsultaPayload } from "@/lib/consulta.mjs";

function responseHeaders(requestId: string) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-request-id": requestId,
  };
}

async function verifyTurnstile(token: string, request: Request) {
  const secret = (env as typeof env & { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;
  if (!secret) return token === "local-demo-token";
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
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
    body = await request.json();
  } catch {
    return errorResponse(requestId, 400, "El formato de la consulta no es válido.");
  }

  const validation = validateConsultaPayload(body);
  if (!validation.ok) {
    return errorResponse(requestId, 400, validation.message);
  }

  const turnstileToken = (body as { turnstile_token: string }).turnstile_token;
  if (!(await verifyTurnstile(turnstileToken, request))) {
    return errorResponse(requestId, 403, "No fue posible validar la consulta. Inténtalo nuevamente.");
  }

  try {
    // Iteración 1: token sintético local. Turnstile se verificará contra el
    // servicio administrado en el despliegue demo, sin cambiar este contrato.
    const updatedAt = await ensureDemoSnapshot(env.DB);
    const results = await queryPublicRegistry(env.DB, validation.value);

    return Response.json(
      {
        request_id: requestId,
        resultados: results,
        total: results.length,
        datos_actualizados_al: updatedAt,
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
