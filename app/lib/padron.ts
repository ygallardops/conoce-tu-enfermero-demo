import demoSnapshotJson from "../data/demo/canonical/padron-snapshot.json";
import { normalizeSearchValue } from "./consulta.mjs";

type PublicRecord = {
  num_cep: string;
  nombres_completos: string;
  consejo_regional: string;
  estado_habilidad: "Habilitado" | "Inhabilitado";
  fecha_actualizacion: string;
  foto_url: string | null;
};

type DemoSnapshot = {
  schema_version: string;
  dataset_version: string;
  generated_at: string;
  source: string;
  record_count: number;
  checksum_sha256: string;
  records: PublicRecord[];
};

const demoSnapshot = demoSnapshotJson as DemoSnapshot;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS padron_snapshots (
    dataset_version TEXT PRIMARY KEY NOT NULL,
    schema_version TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    source TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    checksum_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'staging',
    imported_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS padron_publico (
    dataset_version TEXT NOT NULL,
    num_cep TEXT NOT NULL,
    nombres_completos TEXT NOT NULL,
    nombre_normalizado TEXT NOT NULL,
    consejo_regional TEXT NOT NULL,
    estado_habilidad TEXT NOT NULL,
    fecha_actualizacion TEXT NOT NULL,
    foto_url TEXT,
    PRIMARY KEY (dataset_version, num_cep),
    FOREIGN KEY (dataset_version) REFERENCES padron_snapshots(dataset_version) ON DELETE CASCADE
  )`,
  "CREATE INDEX IF NOT EXISTS idx_padron_snapshots_status ON padron_snapshots(status)",
  "CREATE INDEX IF NOT EXISTS idx_padron_cep_version ON padron_publico(num_cep, dataset_version)",
  "CREATE INDEX IF NOT EXISTS idx_padron_nombre_version ON padron_publico(nombre_normalizado, dataset_version)",
];

export async function ensureDemoSnapshot(db: D1Database): Promise<string> {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  const existing = await db
    .prepare("SELECT checksum_sha256, status FROM padron_snapshots WHERE dataset_version = ?")
    .bind(demoSnapshot.dataset_version)
    .first<{ checksum_sha256: string; status: string }>();
  if (existing?.checksum_sha256 === demoSnapshot.checksum_sha256 && existing.status === "active") {
    return demoSnapshot.generated_at;
  }

  // A version is immutable. The ingesta must publish a new dataset_version
  // instead of overwriting an already traceable public snapshot.
  if (existing && existing.checksum_sha256 !== demoSnapshot.checksum_sha256) {
    throw new Error("El snapshot activo no coincide con la version canonica.");
  }

  const importedAt = new Date().toISOString();
  const snapshotStatement = existing
    ? db
      .prepare(
        `UPDATE padron_snapshots SET
          schema_version = ?, generated_at = ?, source = ?, record_count = ?,
          checksum_sha256 = ?, status = 'staging', imported_at = ?
        WHERE dataset_version = ?`,
      )
      .bind(
        demoSnapshot.schema_version,
        demoSnapshot.generated_at,
        demoSnapshot.source,
        demoSnapshot.record_count,
        demoSnapshot.checksum_sha256,
        importedAt,
        demoSnapshot.dataset_version,
      )
    : db.prepare(
      `INSERT INTO padron_snapshots (
        dataset_version, schema_version, generated_at, source, record_count,
        checksum_sha256, status, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'staging', ?)`,
    )
    .bind(
      demoSnapshot.dataset_version,
      demoSnapshot.schema_version,
      demoSnapshot.generated_at,
      demoSnapshot.source,
      demoSnapshot.record_count,
      demoSnapshot.checksum_sha256,
      importedAt,
    );
  const recordStatements = demoSnapshot.records.map((record) =>
    db
      .prepare(
        `INSERT INTO padron_publico (
          dataset_version, num_cep, nombres_completos, nombre_normalizado,
          consejo_regional, estado_habilidad, fecha_actualizacion, foto_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        demoSnapshot.dataset_version,
        record.num_cep,
        record.nombres_completos,
        normalizeSearchValue(record.nombres_completos),
        record.consejo_regional,
        record.estado_habilidad,
        record.fecha_actualizacion,
        record.foto_url,
      ),
  );

  const resetStatements = existing
    ? [db.prepare("DELETE FROM padron_publico WHERE dataset_version = ?").bind(demoSnapshot.dataset_version)]
    : [];
  const activateStatements = [
    db
      .prepare("UPDATE padron_snapshots SET status = 'retired' WHERE status = 'active' AND dataset_version <> ?")
      .bind(demoSnapshot.dataset_version),
    db
      .prepare("UPDATE padron_snapshots SET status = 'active' WHERE dataset_version = ?")
      .bind(demoSnapshot.dataset_version),
  ];

  // D1 batch executes the staging import and activation as one transaction, so
  // a public query observes either the previous active version or the complete
  // new version, never a partially populated padron.
  await db.batch([snapshotStatement, ...resetStatements, ...recordStatements, ...activateStatements]);
  return demoSnapshot.generated_at;
}

export async function queryPublicRegistry(
  db: D1Database,
  input: { tipo: "cep" | "nombre"; valor: string },
): Promise<PublicRecord[]> {
  const predicate = input.tipo === "cep" ? "p.num_cep = ?" : "p.nombre_normalizado = ?";
  const query = `SELECT
      p.num_cep,
      p.nombres_completos,
      p.consejo_regional,
      p.estado_habilidad,
      p.fecha_actualizacion,
      p.foto_url
    FROM padron_publico p
    INNER JOIN padron_snapshots s ON s.dataset_version = p.dataset_version
    WHERE s.status = 'active' AND ${predicate}
    ORDER BY p.nombres_completos ASC
    LIMIT 5`;
  const result = await db.prepare(query).bind(input.valor).all<PublicRecord>();
  return result.results;
}
