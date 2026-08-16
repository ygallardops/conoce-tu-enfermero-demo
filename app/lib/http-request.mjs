export const MAX_REQUEST_BODY_BYTES = 8_192;

export class RequestPayloadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readRequestJson(request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new RequestPayloadError(415, "La consulta debe enviarse como JSON.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BODY_BYTES)) {
    throw new RequestPayloadError(413, "La consulta excede el tamaño permitido.");
  }
  if (!request.body) throw new RequestPayloadError(400, "El formato de la consulta no es válido.");

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestPayloadError(413, "La consulta excede el tamaño permitido.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestPayloadError(400, "El formato de la consulta no es válido.");
  }
}
