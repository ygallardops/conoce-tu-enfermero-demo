import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeSearchValue } from "../../lib/consulta.mjs";
import { parseAllowedPhotoHosts, validateCanonicalSnapshot } from "./snapshot-validation.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultSnapshotPath = resolve(scriptDir, "../../data/demo/canonical/padron-snapshot.json");
const defaultChunkSize = 100;

export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS padron_snapshots (
    dataset_version TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    source TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'staging'
      CHECK (status IN ('staging', 'active', 'retired')),
    imported_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS padron_publico (
    dataset_version TEXT NOT NULL,
    num_cep TEXT NOT NULL,
    nombres_completos TEXT NOT NULL,
    nombre_normalizado TEXT NOT NULL,
    consejo_regional TEXT NOT NULL,
    estado_habilidad TEXT NOT NULL
      CHECK (estado_habilidad IN ('Habilitado', 'Inhabilitado')),
    fecha_actualizacion TEXT NOT NULL,
    foto_url TEXT,
    PRIMARY KEY (dataset_version, num_cep),
    FOREIGN KEY (dataset_version) REFERENCES padron_snapshots(dataset_version) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_padron_snapshots_status ON padron_snapshots(status)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_padron_single_active ON padron_snapshots(status) WHERE status = 'active'",
  "CREATE INDEX IF NOT EXISTS idx_padron_cep_version ON padron_publico(num_cep, dataset_version)",
  "CREATE INDEX IF NOT EXISTS idx_padron_nombre_version ON padron_publico(nombre_normalizado, dataset_version)",
];

const insertRecordSql = `INSERT INTO padron_publico (
  dataset_version, num_cep, nombres_completos, nombre_normalizado,
  consejo_regional, estado_habilidad, fecha_actualizacion, foto_url
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

function statement(sql, params = []) {
  return { sql, params };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function buildImportPlan(snapshot, options = {}) {
  const chunkSize = options.chunkSize ?? defaultChunkSize;
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 250) {
    throw new Error("chunkSize debe estar entre 1 y 250.");
  }
  const validationOptions = options.validationOptions ?? {};
  const summary = validateCanonicalSnapshot(snapshot, validationOptions);
  const recordStatements = snapshot.records.map((record) => statement(insertRecordSql, [
    snapshot.dataset_version,
    record.num_cep,
    record.nombres_completos,
    normalizeSearchValue(record.nombres_completos),
    record.consejo_regional,
    record.estado_habilidad,
    record.fecha_actualizacion,
    record.foto_url,
  ]));
  const version = snapshot.dataset_version;
  const completeCandidate = `EXISTS (
    SELECT 1 FROM padron_snapshots candidate
    WHERE candidate.dataset_version = ?
      AND candidate.status = 'staging'
      AND candidate.record_count = (
        SELECT COUNT(*) FROM padron_publico records
        WHERE records.dataset_version = candidate.dataset_version
      )
      AND NOT EXISTS (
        SELECT 1 FROM padron_snapshots active
        WHERE active.status = 'active'
          AND active.generated_at >= candidate.generated_at
      )
  )`;

  return {
    summary: {
      ...summary,
      chunkSize,
      batchCount: Math.ceil(snapshot.record_count / chunkSize),
      allowedPhotoHosts: validationOptions.allowedPhotoHosts ?? [],
    },
    schema: schemaStatements.map((sql) => statement(sql)),
    inspect: [
      statement(
        `SELECT dataset_version, schema_version, generated_at, source, record_count,
          checksum_sha256, status
        FROM padron_snapshots WHERE dataset_version = ?`,
        [version],
      ),
      statement(
        `SELECT dataset_version, generated_at
        FROM padron_snapshots WHERE status = 'active'
        ORDER BY generated_at DESC LIMIT 1`,
      ),
    ],
    insertStaging: statement(
      `INSERT INTO padron_snapshots (
        dataset_version, schema_version, generated_at, source, record_count,
        checksum_sha256, status, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'staging', ?)`,
      [
        version,
        snapshot.schema_version,
        snapshot.generated_at,
        snapshot.source,
        snapshot.record_count,
        snapshot.checksum_sha256,
        null,
      ],
    ),
    retryStaging: statement(
      "UPDATE padron_snapshots SET imported_at = ? WHERE dataset_version = ? AND status = 'staging'",
      [null, version],
    ),
    resetStaging: statement("DELETE FROM padron_publico WHERE dataset_version = ?", [version]),
    recordBatches: chunks(recordStatements, chunkSize),
    countStaging: statement(
      "SELECT COUNT(*) AS persisted_count FROM padron_publico WHERE dataset_version = ?",
      [version],
    ),
    activate: [
      statement(
        `UPDATE padron_snapshots SET status = 'retired'
        WHERE status = 'active' AND dataset_version <> ? AND ${completeCandidate}`,
        [version, version],
      ),
      statement(
        `UPDATE padron_snapshots SET status = 'active'
        WHERE dataset_version = ? AND status = 'staging'
          AND record_count = (
            SELECT COUNT(*) FROM padron_publico WHERE dataset_version = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM padron_snapshots active
            WHERE active.status = 'active'
              AND active.generated_at >= padron_snapshots.generated_at
          )`,
        [version, version],
      ),
    ],
    verifyActive: statement(
      `SELECT dataset_version, checksum_sha256, status, record_count,
        (SELECT COUNT(*) FROM padron_publico WHERE dataset_version = ?) AS persisted_count
      FROM padron_snapshots WHERE dataset_version = ?`,
      [version, version],
    ),
  };
}

export function parseCliArgs(argv) {
  const options = {
    apply: false,
    chunkSize: defaultChunkSize,
    confirmDataset: null,
    snapshotPath: defaultSnapshotPath,
    help: false,
  };
  let positionalSnapshot = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--confirm-dataset") options.confirmDataset = argv[++index] ?? null;
    else if (argument === "--chunk-size") options.chunkSize = Number(argv[++index]);
    else if (!argument.startsWith("-") && !positionalSnapshot) {
      options.snapshotPath = resolve(argument);
      positionalSnapshot = true;
    } else throw new Error(`Argumento no reconocido: ${argument}`);
  }
  return options;
}

function cloudflareError(payload, status) {
  const codes = Array.isArray(payload?.errors)
    ? payload.errors.map((error) => error?.code).filter(Number.isInteger).join(",")
    : "";
  return new Error(`Cloudflare D1 rechazó la operación (${status})${codes ? ` [códigos: ${codes}]` : "."}`);
}

export class D1RestClient {
  constructor({ accountId, databaseId, apiToken, fetchImpl = fetch }) {
    this.url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
    this.apiToken = apiToken;
    this.fetchImpl = fetchImpl;
  }

  async query(statements) {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ batch: statements }),
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Cloudflare D1 devolvió una respuesta no válida (${response.status}).`);
    }
    if (!response.ok || payload?.success !== true || !Array.isArray(payload.result)) {
      throw cloudflareError(payload, response.status);
    }
    if (payload.result.some((result) => result?.success !== true)) {
      throw new Error("Cloudflare D1 no completó uno de los statements del lote.");
    }
    return payload.result;
  }
}

function firstRow(queryResult) {
  return queryResult?.results?.[0] ?? null;
}

function assertExistingMetadata(existing, snapshot) {
  const expected = {
    schema_version: snapshot.schema_version,
    generated_at: snapshot.generated_at,
    source: snapshot.source,
    record_count: snapshot.record_count,
    checksum_sha256: snapshot.checksum_sha256,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (existing[field] !== value) throw new Error(`La dataset_version existente no es inmutable: ${field}.`);
  }
}

export async function applySnapshot(snapshot, client, options = {}) {
  const plan = buildImportPlan(snapshot, options);
  const importedAt = (options.now ?? new Date()).toISOString();
  await client.query(plan.schema);
  const inspection = await client.query(plan.inspect);
  const existing = firstRow(inspection[0]);
  const active = firstRow(inspection[1]);

  if (existing) {
    assertExistingMetadata(existing, snapshot);
    if (existing.status === "active") return { ...plan.summary, outcome: "already-active" };
    if (existing.status === "retired") throw new Error("Una dataset_version retirada no puede reactivarse.");
    if (existing.status !== "staging") throw new Error("Estado de snapshot no reconocido.");
  }
  if (active && Date.parse(snapshot.generated_at) <= Date.parse(active.generated_at)) {
    throw new Error("El snapshot candidato no es más reciente que el activo.");
  }

  const stagingStatement = existing ? plan.retryStaging : plan.insertStaging;
  stagingStatement.params[0] = existing ? importedAt : stagingStatement.params[0];
  if (!existing) stagingStatement.params[stagingStatement.params.length - 1] = importedAt;
  await client.query([stagingStatement, plan.resetStaging]);
  for (const batch of plan.recordBatches) await client.query(batch);

  const countResult = await client.query([plan.countStaging]);
  const persistedCount = Number(firstRow(countResult[0])?.persisted_count);
  if (persistedCount !== snapshot.record_count) throw new Error("La carga staging quedó incompleta.");

  await client.query(plan.activate);
  const verification = await client.query([plan.verifyActive]);
  const published = firstRow(verification[0]);
  if (
    published?.status !== "active"
    || published.checksum_sha256 !== snapshot.checksum_sha256
    || Number(published.persisted_count) !== snapshot.record_count
  ) {
    throw new Error("D1 no confirmó la activación del snapshot candidato.");
  }
  return { ...plan.summary, outcome: "activated" };
}

function usage() {
  return `Uso:
  node scripts/data/import-d1.mjs [snapshot.json]
  node scripts/data/import-d1.mjs [snapshot.json] --apply --confirm-dataset VERSION

Sin --apply se ejecuta únicamente validación local y no se accede a la red.

PADRON_ALLOWED_PHOTO_HOSTS aprueba hosts para fotografías externas, separados
por comas y sin esquema ni ruta. Sin esa variable la lista queda vacía y solo se
admiten rutas propias del dominio.`;
}

export function readValidationOptions(runtimeEnv = process.env) {
  return { allowedPhotoHosts: parseAllowedPhotoHosts(runtimeEnv.PADRON_ALLOWED_PHOTO_HOSTS) };
}

export async function runCli(argv, runtimeEnv = process.env) {
  const options = parseCliArgs(argv);
  if (options.help) return { help: usage() };
  const snapshot = JSON.parse(await readFile(options.snapshotPath, "utf8"));
  const validationOptions = readValidationOptions(runtimeEnv);
  const plan = buildImportPlan(snapshot, { chunkSize: options.chunkSize, validationOptions });
  if (!options.apply) return { mode: "dry-run", ...plan.summary };
  if (options.confirmDataset !== snapshot.dataset_version) {
    throw new Error("--confirm-dataset debe coincidir exactamente con dataset_version.");
  }
  const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID"];
  const missing = required.filter((name) => !runtimeEnv[name]);
  if (missing.length) throw new Error(`Faltan variables de entorno requeridas: ${missing.join(", ")}.`);
  const client = new D1RestClient({
    apiToken: runtimeEnv.CLOUDFLARE_API_TOKEN,
    accountId: runtimeEnv.CLOUDFLARE_ACCOUNT_ID,
    databaseId: runtimeEnv.CLOUDFLARE_D1_DATABASE_ID,
  });
  return {
    mode: "apply",
    ...await applySnapshot(snapshot, client, { chunkSize: options.chunkSize, validationOptions }),
  };
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) {
  runCli(process.argv.slice(2))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`Ingesta rechazada: ${error.message}`);
      process.exitCode = 1;
    });
}
