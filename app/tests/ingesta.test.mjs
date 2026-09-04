import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applySnapshot,
  buildImportPlan,
  calculateRecordCountVariation,
  formatVariation,
  parseCliArgs,
  readValidationOptions,
  runCli,
} from "../scripts/data/import-d1.mjs";
import {
  calculateRecordsChecksum,
  parseAllowedPhotoHosts,
  validateCanonicalSnapshot,
} from "../scripts/data/snapshot-validation.mjs";

async function demoSnapshot() {
  return JSON.parse(await readFile(
    new URL("../data/demo/canonical/padron-snapshot.json", import.meta.url),
    "utf8",
  ));
}

async function withSnapshotFile(snapshot, run) {
  const directory = await mkdtemp(join(tmpdir(), "cep-snapshot-"));
  const path = join(directory, "snapshot.json");
  try {
    await writeFile(path, JSON.stringify(snapshot), "utf8");
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function successfulResult(results = []) {
  return { success: true, results };
}

class SuccessfulD1Client {
  constructor(snapshot) {
    this.snapshot = snapshot;
    this.calls = [];
    this.persistedCount = 0;
  }

  async query(statements) {
    this.calls.push(structuredClone(statements));
    if (statements.length === 2 && statements[0].sql.includes("FROM padron_snapshots WHERE dataset_version")) {
      return [successfulResult(), successfulResult()];
    }
    if (statements.some((item) => item.sql.startsWith("INSERT INTO padron_publico"))) {
      this.persistedCount += statements.length;
    }
    if (statements[0].sql.startsWith("SELECT COUNT(*) AS persisted_count")) {
      return [successfulResult([{ persisted_count: this.persistedCount }])];
    }
    if (statements[0].sql.includes("SELECT dataset_version, checksum_sha256, status")) {
      return [successfulResult([{
        dataset_version: this.snapshot.dataset_version,
        checksum_sha256: this.snapshot.checksum_sha256,
        status: "active",
        record_count: this.snapshot.record_count,
        persisted_count: this.persistedCount,
      }])];
    }
    return statements.map(() => successfulResult());
  }
}

class ExistingSnapshotClient {
  constructor(snapshot, { status, activeGeneratedAt = null }) {
    this.snapshot = snapshot;
    this.status = status;
    this.activeGeneratedAt = activeGeneratedAt;
    this.calls = [];
  }

  async query(statements) {
    this.calls.push(structuredClone(statements));
    if (statements.length === 2 && statements[0].sql.includes("FROM padron_snapshots WHERE dataset_version")) {
      const existing = {
        dataset_version: this.snapshot.dataset_version,
        schema_version: this.snapshot.schema_version,
        generated_at: this.snapshot.generated_at,
        source: this.snapshot.source,
        record_count: this.snapshot.record_count,
        checksum_sha256: this.snapshot.checksum_sha256,
        status: this.status,
      };
      const active = this.activeGeneratedAt
        ? [{ dataset_version: "active-version", generated_at: this.activeGeneratedAt }]
        : [];
      return [successfulResult([existing]), successfulResult(active)];
    }
    return statements.map(() => successfulResult());
  }
}

class ActiveSnapshotClient extends SuccessfulD1Client {
  constructor(snapshot, { activeRecordCount, activeGeneratedAt = "2026-08-01T15:00:00.000Z" }) {
    super(snapshot);
    this.activeRecordCount = activeRecordCount;
    this.activeGeneratedAt = activeGeneratedAt;
  }

  async query(statements) {
    if (statements.length === 2 && statements[0].sql.includes("FROM padron_snapshots WHERE dataset_version")) {
      this.calls.push(structuredClone(statements));
      return [successfulResult(), successfulResult([{
        dataset_version: "padron-anterior",
        generated_at: this.activeGeneratedAt,
        record_count: this.activeRecordCount,
      }])];
    }
    return super.query(statements);
  }
}

function truncatedSnapshot(snapshot, recordCount) {
  const candidate = structuredClone(snapshot);
  candidate.records = candidate.records.slice(0, recordCount);
  candidate.record_count = candidate.records.length;
  candidate.checksum_sha256 = calculateRecordsChecksum(candidate.records);
  return candidate;
}

class IncompleteD1Client extends SuccessfulD1Client {
  async query(statements) {
    if (statements[0].sql.startsWith("SELECT COUNT(*) AS persisted_count")) {
      this.calls.push(structuredClone(statements));
      return [successfulResult([{ persisted_count: this.persistedCount - 1 }])];
    }
    return super.query(statements);
  }
}

test("valida el snapshot canónico y detecta alteraciones", async () => {
  const snapshot = await demoSnapshot();
  const summary = validateCanonicalSnapshot(snapshot);

  assert.equal(summary.recordCount, 60);
  assert.equal(summary.datasetVersion, "demo-2026-08-09-seed-22315");

  const altered = structuredClone(snapshot);
  altered.records[0].estado_habilidad = "Habilitado";
  await assert.rejects(
    async () => validateCanonicalSnapshot(altered),
    /checksum_sha256: no coincide/,
  );
});

test("rechaza controles Unicode y fotografías fuera de hosts aprobados", async () => {
  const snapshot = await demoSnapshot();
  const externalPhoto = structuredClone(snapshot);
  externalPhoto.records[0].foto_url = "https://imagenes.example/foto.webp";
  externalPhoto.checksum_sha256 = calculateRecordsChecksum(externalPhoto.records);

  assert.throws(() => validateCanonicalSnapshot(externalPhoto), /hosts aprobados/);
  assert.doesNotThrow(() => validateCanonicalSnapshot(externalPhoto, {
    allowedPhotoHosts: ["imagenes.example"],
  }));

  const spoofed = structuredClone(snapshot);
  spoofed.records[0].nombres_completos = `ANA\u202E PERSONA SINTETICA`;
  spoofed.checksum_sha256 = calculateRecordsChecksum(spoofed.records);
  assert.throws(() => validateCanonicalSnapshot(spoofed), /caracteres no permitidos/);
});

test("genera lotes parametrizados sin concatenar el padrón al SQL", async () => {
  const snapshot = await demoSnapshot();
  const plan = buildImportPlan(snapshot, { chunkSize: 25 });
  const recordStatements = plan.recordBatches.flat();

  assert.equal(plan.summary.batchCount, 3);
  assert.equal(recordStatements.length, 60);
  assert.ok(recordStatements.every((item) => item.sql.includes("VALUES (?, ?, ?, ?, ?, ?, ?, ?)")));
  assert.ok(recordStatements.every((item) => item.params.length === 8));
  assert.ok(recordStatements.every((item) => !item.sql.includes("PERSONA SINTETICA")));
  assert.match(plan.activate[0].sql, /candidate\.record_count/);
  assert.match(plan.activate[0].sql, /active\.generated_at >= candidate\.generated_at/);
  assert.ok(plan.schema.some((item) => item.sql.includes("idx_padron_single_active")));
  assert.ok(plan.schema.some((item) => item.sql.includes("CHECK (estado_habilidad")));
});

test("la migración D1 refuerza invariantes sin reconstruir tablas con datos", async () => {
  const migration = await readFile(
    new URL("../drizzle/0001_open_matthew_murdock.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS `idx_padron_single_active`/);
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS `ck_padron_estado_habilidad_insert`/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|PRAGMA foreign_keys/i);
});

test("el CLI usa dry-run por defecto y exige confirmación para aplicar", async () => {
  const snapshotPath = fileURLToPath(new URL("../data/demo/canonical/padron-snapshot.json", import.meta.url));
  const dryRun = await runCli([snapshotPath]);

  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.recordCount, 60);
  assert.equal(parseCliArgs([]).apply, false);
  await assert.rejects(
    runCli([snapshotPath, "--apply", "--confirm-dataset", "otra-version"], {}),
    /confirm-dataset debe coincidir/,
  );
});

test("el CLI aprueba fotografías externas solo a través de la variable de entorno", async () => {
  const snapshot = await demoSnapshot();
  snapshot.records[0].foto_url = "https://imagenes.example/foto.webp";
  snapshot.checksum_sha256 = calculateRecordsChecksum(snapshot.records);

  await withSnapshotFile(snapshot, async (path) => {
    await assert.rejects(runCli([path], {}), /hosts aprobados/);

    const approved = await runCli([path], { PADRON_ALLOWED_PHOTO_HOSTS: " Imagenes.Example , imagenes.example " });
    assert.equal(approved.mode, "dry-run");
    assert.equal(approved.recordCount, 60);
    assert.deepEqual(approved.allowedPhotoHosts, ["imagenes.example"]);
  });
});

test("una lista de hosts mal formada detiene el dry-run antes de tocar la red", async () => {
  const snapshotPath = fileURLToPath(new URL("../data/demo/canonical/padron-snapshot.json", import.meta.url));
  const rejected = ["https://cep.org.pe", "cep.org.pe/fotos", "cep.org.pe:443", "*.cep.org.pe"];

  for (const value of rejected) {
    await assert.rejects(
      runCli([snapshotPath], { PADRON_ALLOWED_PHOTO_HOSTS: value }),
      /no es un nombre de host válido/,
      `debía rechazar ${value}`,
    );
  }

  assert.deepEqual(readValidationOptions({}).allowedPhotoHosts, []);
  assert.deepEqual(parseAllowedPhotoHosts("  "), []);
  assert.deepEqual(parseAllowedPhotoHosts("fotos.cep.org.pe,CDN.cep.org.pe"), [
    "fotos.cep.org.pe",
    "cdn.cep.org.pe",
  ]);
});

test("publica staging y activa solo después de verificar el conteo", async () => {
  const snapshot = await demoSnapshot();
  const client = new SuccessfulD1Client(snapshot);
  const result = await applySnapshot(snapshot, client, { chunkSize: 25 });
  const statements = client.calls.flat();

  assert.equal(result.outcome, "activated");
  assert.equal(client.persistedCount, 60);
  assert.ok(statements.some((item) => item.sql.includes("status = 'staging'")));
  assert.ok(statements.some((item) => item.sql.includes("status = 'retired'")));
  assert.ok(statements.some((item) => item.sql.includes("status = 'active'")));
});

test("trata el snapshot activo como idempotente y no vuelve a escribir", async () => {
  const snapshot = await demoSnapshot();
  const client = new ExistingSnapshotClient(snapshot, { status: "active" });
  const result = await applySnapshot(snapshot, client);

  assert.equal(result.outcome, "already-active");
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls[0].every((item) => item.sql.startsWith("CREATE")));
});

test("rechaza reactivar una versión retirada o sustituir una versión más reciente", async () => {
  const snapshot = await demoSnapshot();
  const retiredClient = new ExistingSnapshotClient(snapshot, { status: "retired" });
  await assert.rejects(applySnapshot(snapshot, retiredClient), /retirada no puede reactivarse/);

  const candidate = structuredClone(snapshot);
  candidate.dataset_version = "demo-stale-candidate";
  const staleClient = new ExistingSnapshotClient(candidate, {
    status: "staging",
    activeGeneratedAt: "2026-08-10T15:00:00.000Z",
  });
  await assert.rejects(applySnapshot(candidate, staleClient), /no es más reciente que el activo/);
  assert.equal(staleClient.calls.length, 2);
});

test("un snapshot sin registros no es publicable por ninguna vía", async () => {
  const snapshot = await demoSnapshot();
  const vacio = truncatedSnapshot(snapshot, 0);

  assert.equal(vacio.checksum_sha256, "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
  assert.throws(() => validateCanonicalSnapshot(vacio), /sin registros no es publicable/);
  assert.throws(() => buildImportPlan(vacio), /sin registros no es publicable/);
  await withSnapshotFile(vacio, async (path) => {
    await assert.rejects(runCli([path], {}), /sin registros no es publicable/);
  });

  const client = new ActiveSnapshotClient(vacio, { activeRecordCount: 60 });
  await assert.rejects(applySnapshot(vacio, client), /sin registros no es publicable/);
  assert.equal(client.calls.length, 0);
});

test("una variación grande del padrón exige confirmación con la cifra observada", async () => {
  const snapshot = await demoSnapshot();
  const candidate = truncatedSnapshot(snapshot, 40);

  const blocked = new ActiveSnapshotClient(candidate, { activeRecordCount: 60 });
  await assert.rejects(
    applySnapshot(candidate, blocked, { chunkSize: 25 }),
    /reduce el padrón un 33\.3 %.*60 -> 40 registros.*--confirm-variation 33\.3/s,
  );
  assert.ok(blocked.calls.flat().every((item) => !item.sql.startsWith("INSERT INTO")));
  assert.equal(parseCliArgs(["--confirm-variation", "33.3"]).confirmVariation, "33.3");
  assert.equal(parseCliArgs([]).confirmVariation, null);

  const wrong = new ActiveSnapshotClient(candidate, { activeRecordCount: 60 });
  await assert.rejects(
    applySnapshot(candidate, wrong, { chunkSize: 25, confirmVariation: "33" }),
    /--confirm-variation 33\.3/,
  );

  const confirmed = new ActiveSnapshotClient(candidate, { activeRecordCount: 60 });
  const result = await applySnapshot(candidate, confirmed, { chunkSize: 25, confirmVariation: "33.3" });
  assert.equal(result.outcome, "activated");
  assert.equal(result.previousRecordCount, 60);
  assert.equal(result.variation, "33.3");
});

test("una variación dentro del umbral no interrumpe la publicación", async () => {
  const snapshot = await demoSnapshot();
  const candidate = truncatedSnapshot(snapshot, 57);
  const client = new ActiveSnapshotClient(candidate, { activeRecordCount: 60 });
  const result = await applySnapshot(candidate, client, { chunkSize: 25 });

  assert.equal(result.outcome, "activated");
  assert.equal(result.variation, "5.0");

  const primeraCarga = new SuccessfulD1Client(snapshot);
  const inicial = await applySnapshot(snapshot, primeraCarga, { chunkSize: 25 });
  assert.equal(inicial.outcome, "activated");
  assert.equal(inicial.previousRecordCount, null);
  assert.equal(inicial.variation, null);

  assert.equal(calculateRecordCountVariation(60, 66), 0.1);
  assert.equal(calculateRecordCountVariation(0, 60), null);
  assert.equal(formatVariation(0.11667), "11.7");
});

test("una carga incompleta permanece sin activación", async () => {
  const snapshot = await demoSnapshot();
  const client = new IncompleteD1Client(snapshot);

  await assert.rejects(applySnapshot(snapshot, client, { chunkSize: 25 }), /staging quedó incompleta/);
  const statements = client.calls.flat();
  assert.ok(statements.some((item) => item.sql.startsWith("INSERT INTO padron_publico")));
  assert.ok(!statements.some((item) => item.sql.includes("SET status = 'active'")));
});
