import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const canonicalDir = resolve(scriptDir, "../../data/demo/canonical");
const files = ["from-json.json", "from-csv.json", "from-api-ndjson.json"];
const allowedFields = new Set([
  "num_cep", "nombres_completos", "consejo_regional", "estado_habilidad",
  "fecha_actualizacion", "foto_url",
]);
const forbiddenFields = new Set([
  "dni", "documento", "email", "correo", "telefono", "domicilio", "direccion",
  "fecha_nacimiento", "deuda", "pagos",
]);

function fail(message) {
  throw new Error(message);
}

function calculateChecksum(records) {
  const sorted = [...records].sort((a, b) => a.num_cep.localeCompare(b.num_cep));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

function validateSnapshot(snapshot, file) {
  if (snapshot.schema_version !== "1.0") fail(`${file}: versión de esquema inválida.`);
  if (!Array.isArray(snapshot.records)) fail(`${file}: records no es un arreglo.`);
  if (snapshot.record_count !== snapshot.records.length) fail(`${file}: record_count inconsistente.`);
  const seen = new Set();
  for (const [index, record] of snapshot.records.entries()) {
    const fields = Object.keys(record);
    const extras = fields.filter((field) => !allowedFields.has(field));
    if (extras.length) fail(`${file}[${index}]: campos no autorizados: ${extras.join(", ")}.`);
    const forbidden = fields.filter((field) => forbiddenFields.has(field.toLowerCase()));
    if (forbidden.length) fail(`${file}[${index}]: datos personales prohibidos: ${forbidden.join(", ")}.`);
    for (const required of allowedFields) {
      if (!(required in record)) fail(`${file}[${index}]: falta ${required}.`);
    }
    if (!/^\d{5,6}$/.test(record.num_cep)) fail(`${file}[${index}]: num_cep inválido.`);
    if (seen.has(record.num_cep)) fail(`${file}: num_cep duplicado ${record.num_cep}.`);
    seen.add(record.num_cep);
    if (!["Habilitado", "Inhabilitado"].includes(record.estado_habilidad)) {
      fail(`${file}[${index}]: estado inválido.`);
    }
    if (Number.isNaN(Date.parse(record.fecha_actualizacion))) fail(`${file}[${index}]: fecha inválida.`);
    if (!record.nombres_completos.includes("SINTETICA")) fail(`${file}[${index}]: el dato demo no está marcado como sintético.`);
  }
  const checksum = calculateChecksum(snapshot.records);
  if (checksum !== snapshot.checksum_sha256) fail(`${file}: checksum inválido.`);
  return checksum;
}

const snapshots = await Promise.all(files.map(async (file) => {
  const content = await readFile(resolve(canonicalDir, file), "utf8");
  return [file, JSON.parse(content)];
}));
const checksums = snapshots.map(([file, snapshot]) => validateSnapshot(snapshot, file));
if (new Set(checksums).size !== 1) fail("Los adaptadores no son equivalentes.");
console.log(`Verificación correcta: ${files.length} orígenes, checksum común ${checksums[0]}.`);
