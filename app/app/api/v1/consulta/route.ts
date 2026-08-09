import { env } from "cloudflare:workers";
import { ensureDemoSnapshot, queryPublicRegistry } from "@/lib/padron";
import { validateConsultaPayload } from "@/lib/consulta.mjs";

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

function errorResponse(requestId: string, status: number, message: string) {
  return Response.json(
    { request_id: requestId, error: { message } },
    { status, headers: responseHeaders },
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
      { headers: responseHeaders },
    );
  } catch {
    // Do not include query contents or internal database details in a response.
    return errorResponse(requestId, 503, "La consulta no está disponible en este momento. Inténtalo nuevamente.");
  }
}

export function GET() {
  return new Response(null, {
    status: 405,
    headers: { ...responseHeaders, allow: "POST" },
  });
}
