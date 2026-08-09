import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "../..");
const rawDir = resolve(appDir, "data/demo/raw");
const canonicalDir = resolve(appDir, "data/demo/canonical");
const generatedAt = "2026-08-09T15:00:00.000Z";
const datasetVersion = "demo-2026-08-09-seed-22315";

const givenNames = [
  "ANA", "CARMEN", "DANIELA", "ELENA", "GLORIA", "JULIA", "LUCIA", "MARIA",
  "PATRICIA", "ROSA", "SOFIA", "TERESA", "ANDREA", "MELISSA", "VERONICA",
];
const surnames = [
  "ALVAREZ", "CASTILLO", "CHAVEZ", "FLORES", "GARCIA", "HUAMAN", "MAMANI",
  "MENDOZA", "QUISPE", "RAMIREZ", "ROJAS", "SALAZAR", "SANCHEZ", "TORRES", "VARGAS",
];
const councils = [
  "CONSEJO REGIONAL II LA LIBERTAD",
  "CONSEJO REGIONAL DEMO LIMA",
  "CONSEJO REGIONAL DEMO AREQUIPA",
  "CONSEJO REGIONAL DEMO CUSCO",
  "CONSEJO REGIONAL DEMO PIURA",
];

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(items, random) {
  return items[Math.floor(random() * items.length)];
}

function normalizeText(value) {
  return String(value).trim().normalize("NFC").replace(/\s+/g, " ");
}

function normalizeStatus(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (["habilitado", "habilitada", "h", "activo", "1"].includes(normalized)) return "Habilitado";
  if (["inhabilitado", "inhabilitada", "i", "inactivo", "0"].includes(normalized)) return "Inhabilitado";
  throw new Error(`Estado no reconocido: ${value}`);
}

function canonicalRecord(record) {
  return {
    num_cep: normalizeText(record.num_cep).toUpperCase(),
    nombres_completos: normalizeText(record.nombres_completos).toUpperCase(),
    consejo_regional: normalizeText(record.consejo_regional).toUpperCase(),
    estado_habilidad: normalizeStatus(record.estado_habilidad),
    fecha_actualizacion: new Date(record.fecha_actualizacion).toISOString(),
    foto_url: record.foto_url ? normalizeText(record.foto_url) : null,
  };
}

function sortRecords(records) {
  return records.map(canonicalRecord).sort((a, b) => a.num_cep.localeCompare(b.num_cep));
}

function recordsChecksum(records) {
  return createHash("sha256").update(JSON.stringify(sortRecords(records))).digest("hex");
}

function makeSnapshot(records, source) {
  const normalized = sortRecords(records);
  return {
    schema_version: "1.0",
    dataset_version: datasetVersion,
    generated_at: generatedAt,
    source,
    record_count: normalized.length,
    checksum_sha256: recordsChecksum(normalized),
    records: normalized,
  };
}

function quoteCsv(value) {
  const text = value ?? "";
  return `"${String(text).replaceAll('"', '""')}"`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""])));
}

function generateRecords() {
  const random = mulberry32(22315);
  return Array.from({ length: 60 }, (_, index) => {
    const sequence = index + 1;
    const first = pick(givenNames, random);
    const paternal = pick(surnames, random);
    const maternal = pick(surnames, random);
    const dayOffset = Math.floor(random() * 20);
    const updated = new Date(Date.UTC(2026, 7, 8 - dayOffset, 12, 0, 0));
    return canonicalRecord({
      num_cep: `D${String(100000 + sequence)}`,
      nombres_completos: `PERSONA SINTETICA ${String(sequence).padStart(3, "0")} ${first} ${paternal} ${maternal}`,
      consejo_regional: councils[index % councils.length],
      estado_habilidad: random() > 0.25 ? "Habilitado" : "Inhabilitado",
      fecha_actualizacion: updated.toISOString(),
      foto_url: index % 7 === 0 ? null : `/demo/fotos/persona-sintetica-${String(sequence).padStart(3, "0")}.webp`,
    });
  });
}

function fromJsonSource(source) {
  return source.rows.map((row) => canonicalRecord({
    num_cep: row.cep,
    nombres_completos: row.nombre_publico,
    consejo_regional: row.consejo,
    estado_habilidad: row.estado,
    fecha_actualizacion: row.actualizado_en,
    foto_url: row.foto,
  }));
}

function fromCsvSource(text) {
  return parseCsv(text).map((row) => canonicalRecord({
    num_cep: row.numero_colegiatura,
    nombres_completos: row.nombres,
    consejo_regional: row.consejo,
    estado_habilidad: row.habilidad,
    fecha_actualizacion: row.actualizado,
    foto_url: row.foto_url,
  }));
}

function fromNdjsonSource(text) {
  return text.trim().split(/\r?\n/).map((line) => JSON.parse(line)).map((row) => canonicalRecord({
    num_cep: row.registration.number,
    nombres_completos: row.person.displayName,
    consejo_regional: row.membership.regionalCouncil,
    estado_habilidad: row.membership.enabled ? "Habilitado" : "Inhabilitado",
    fecha_actualizacion: row.membership.statusAsOf,
    foto_url: row.person.publicPhoto,
  }));
}

async function main() {
  await mkdir(rawDir, { recursive: true });
  await mkdir(canonicalDir, { recursive: true });
  const records = generateRecords();

  const jsonSource = {
    export_type: "postgres_readonly_view_simulation",
    synthetic: true,
    rows: records.map((record) => ({
      cep: record.num_cep,
      nombre_publico: record.nombres_completos,
      consejo: record.consejo_regional,
      estado: record.estado_habilidad === "Habilitado" ? "ACTIVO" : "INACTIVO",
      actualizado_en: record.fecha_actualizacion,
      foto: record.foto_url,
    })),
  };
  const csvHeaders = ["numero_colegiatura", "nombres", "consejo", "habilidad", "actualizado", "foto_url"];
  const csvSource = [
    csvHeaders.map(quoteCsv).join(","),
    ...records.map((record) => [
      record.num_cep,
      record.nombres_completos,
      record.consejo_regional,
      record.estado_habilidad === "Habilitado" ? "H" : "I",
      record.fecha_actualizacion,
      record.foto_url,
    ].map(quoteCsv).join(",")),
  ].join("\n");
  const ndjsonSource = records.map((record) => JSON.stringify({
    demo: true,
    registration: { number: record.num_cep },
    person: { displayName: record.nombres_completos, publicPhoto: record.foto_url },
    membership: {
      regionalCouncil: record.consejo_regional,
      enabled: record.estado_habilidad === "Habilitado",
      statusAsOf: record.fecha_actualizacion,
    },
  })).join("\n");

  await writeFile(resolve(rawDir, "postgres-view-simulated.json"), `${JSON.stringify(jsonSource, null, 2)}\n`);
  await writeFile(resolve(rawDir, "legacy-export-simulated.csv"), `${csvSource}\n`);
  await writeFile(resolve(rawDir, "api-stream-simulated.ndjson"), `${ndjsonSource}\n`);

  const snapshots = [
    makeSnapshot(fromJsonSource(jsonSource), "demo:postgres-view-json"),
    makeSnapshot(fromCsvSource(csvSource), "demo:legacy-csv"),
    makeSnapshot(fromNdjsonSource(ndjsonSource), "demo:api-ndjson"),
  ];
  const names = ["from-json.json", "from-csv.json", "from-api-ndjson.json"];
  await Promise.all(snapshots.map((snapshot, index) =>
    writeFile(resolve(canonicalDir, names[index]), `${JSON.stringify(snapshot, null, 2)}\n`),
  ));
  await writeFile(resolve(canonicalDir, "padron-snapshot.json"), `${JSON.stringify(snapshots[0], null, 2)}\n`);

  const checksums = snapshots.map((snapshot) => snapshot.checksum_sha256);
  const report = {
    synthetic: true,
    generated_at: generatedAt,
    sources: snapshots.map((snapshot, index) => ({
      source: snapshot.source,
      output: names[index],
      record_count: snapshot.record_count,
      checksum_sha256: snapshot.checksum_sha256,
    })),
    equivalent: new Set(checksums).size === 1,
  };
  await writeFile(resolve(canonicalDir, "compatibility-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (!report.equivalent) throw new Error("Los adaptadores no producen conjuntos equivalentes.");
  console.log(`Demo generada: ${records.length} registros sintéticos; checksum ${checksums[0]}.`);
}

await main();

