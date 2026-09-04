import { createHash } from "node:crypto";

const envelopeFields = [
  "schema_version",
  "dataset_version",
  "generated_at",
  "source",
  "record_count",
  "checksum_sha256",
  "records",
];

const recordFields = [
  "num_cep",
  "nombres_completos",
  "consejo_regional",
  "estado_habilidad",
  "fecha_actualizacion",
  "foto_url",
];
const unsafeFormatCharacters = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u;
const photoHostPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function fail(message) {
  throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactFields(value, expected, context) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    fail(`${context}: campos distintos al contrato canónico.`);
  }
}

function assertCanonicalText(value, field, minLength, maxLength) {
  if (typeof value !== "string") fail(`${field}: debe ser texto.`);
  if (value.length < minLength || value.length > maxLength) fail(`${field}: longitud inválida.`);
  if (value !== value.trim().normalize("NFC")) fail(`${field}: debe estar recortado y normalizado en NFC.`);
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
  if (value.includes("<") || value.includes(">") || hasControlCharacter || unsafeFormatCharacters.test(value)) {
    fail(`${field}: contiene caracteres no permitidos.`);
  }
}

function assertDate(value, field, now) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail(`${field}: fecha inválida.`);
  if (new Date(value).toISOString() !== value) fail(`${field}: debe usar ISO 8601 UTC canónico.`);
  if (Date.parse(value) > now.getTime() + 86_400_000) fail(`${field}: fecha futura fuera de tolerancia.`);
}

function assertPhotoUrl(value, field, allowedPhotoHosts) {
  if (value === null) return;
  assertCanonicalText(value, field, 1, 500);
  if (value.startsWith("/")) {
    if (value.startsWith("//") || value.includes("\\") || value.split("/").includes("..")) {
      fail(`${field}: ruta relativa no permitida.`);
    }
    return;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${field}: URL inválida.`);
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || !allowedPhotoHosts.has(parsed.hostname.toLowerCase())
  ) {
    fail(`${field}: solo se permiten URL HTTPS de hosts aprobados y sin credenciales.`);
  }
}

export function parseAllowedPhotoHosts(value) {
  if (value === undefined || value === null) return [];
  const hosts = [];
  for (const entry of String(value).split(",")) {
    const host = entry.trim().toLowerCase();
    if (!host) continue;
    if (host.length > 253 || !photoHostPattern.test(host)) {
      fail(`hosts de fotografía: "${entry.trim()}" no es un nombre de host válido; se espera solo el host, sin esquema, puerto, ruta ni comodines.`);
    }
    if (!hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

export function calculateRecordsChecksum(records) {
  const sorted = [...records].sort((left, right) => left.num_cep.localeCompare(right.num_cep));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export function validateCanonicalSnapshot(snapshot, options = {}) {
  const now = options.now ?? new Date();
  const allowedPhotoHosts = new Set(
    (options.allowedPhotoHosts ?? []).map((hostname) => String(hostname).trim().toLowerCase()),
  );
  if (!isPlainObject(snapshot)) fail("snapshot: debe ser un objeto.");
  assertExactFields(snapshot, envelopeFields, "snapshot");

  if (snapshot.schema_version !== "1.0") fail("schema_version: versión no soportada.");
  if (typeof snapshot.dataset_version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(snapshot.dataset_version)) {
    fail("dataset_version: formato inválido.");
  }
  assertDate(snapshot.generated_at, "generated_at", now);
  assertCanonicalText(snapshot.source, "source", 1, 120);
  if (!Number.isInteger(snapshot.record_count) || snapshot.record_count < 0 || snapshot.record_count > 1_000_000) {
    fail("record_count: valor inválido.");
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.checksum_sha256)) fail("checksum_sha256: formato inválido.");
  if (!Array.isArray(snapshot.records)) fail("records: debe ser un arreglo.");
  if (snapshot.record_count !== snapshot.records.length) fail("record_count: no coincide con records.");

  const seen = new Set();
  for (const [index, record] of snapshot.records.entries()) {
    const context = `records[${index}]`;
    if (!isPlainObject(record)) fail(`${context}: debe ser un objeto.`);
    assertExactFields(record, recordFields, context);
    if (typeof record.num_cep !== "string" || !/^[0-9]{5,6}$/.test(record.num_cep)) {
      fail(`${context}.num_cep: formato inválido.`);
    }
    if (seen.has(record.num_cep)) fail(`${context}.num_cep: valor duplicado.`);
    seen.add(record.num_cep);
    assertCanonicalText(record.nombres_completos, `${context}.nombres_completos`, 3, 160);
    assertCanonicalText(record.consejo_regional, `${context}.consejo_regional`, 3, 160);
    if (!new Set(["Habilitado", "Inhabilitado"]).has(record.estado_habilidad)) {
      fail(`${context}.estado_habilidad: valor inválido.`);
    }
    assertDate(record.fecha_actualizacion, `${context}.fecha_actualizacion`, now);
    assertPhotoUrl(record.foto_url, `${context}.foto_url`, allowedPhotoHosts);
  }

  const checksum = calculateRecordsChecksum(snapshot.records);
  if (checksum !== snapshot.checksum_sha256) fail("checksum_sha256: no coincide con los registros.");
  return {
    datasetVersion: snapshot.dataset_version,
    generatedAt: snapshot.generated_at,
    recordCount: snapshot.record_count,
    checksum,
  };
}
