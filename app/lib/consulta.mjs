const wildcardPattern = /[*%_]/;

export function normalizeSearchValue(value) {
  return String(value)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function validateConsultaPayload(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "El formato de la consulta no es válido." };
  }

  const { tipo, valor, turnstile_token: turnstileToken } = body;
  if (tipo !== "cep" && tipo !== "nombre") {
    return { ok: false, message: "Selecciona un tipo de consulta válido." };
  }
  if (typeof valor !== "string" || typeof turnstileToken !== "string" || !turnstileToken.trim()) {
    return { ok: false, message: "Completa los datos requeridos para consultar." };
  }
  if (wildcardPattern.test(valor)) {
    return { ok: false, message: "No se permiten comodines en la consulta." };
  }

  const normalized = normalizeSearchValue(valor);
  const maxLength = tipo === "cep" ? 20 : 160;
  const minLength = tipo === "cep" ? 1 : 3;

  if (normalized.length < minLength || normalized.length > maxLength) {
    return { ok: false, message: "El valor de consulta no tiene una longitud válida." };
  }
  if (tipo === "cep" && !/^[A-Z0-9-]+$/.test(normalized)) {
    return { ok: false, message: "El número CEP solo puede contener letras, números o guiones." };
  }

  return { ok: true, value: { tipo, valor: normalized } };
}
