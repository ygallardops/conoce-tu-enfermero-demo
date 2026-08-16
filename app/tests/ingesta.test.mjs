import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  applySnapshot,
  buildImportPlan,
  parseCliArgs,
  runCli,
} from "../scripts/data/import-d1.mjs";
import { calculateRecordsChecksum, validateCanonicalSnapshot } from "../scripts/data/snapshot-validation.mjs";

async function demoSnapshot() {
  return JSON.parse(await readFile(
    new URL("../data/demo/canonical/padron-snapshot.json", import.meta.url),
    "utf8",
  ));
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

test("una carga incompleta permanece sin activación", async () => {
  const snapshot = await demoSnapshot();
  const client = new IncompleteD1Client(snapshot);

  await assert.rejects(applySnapshot(snapshot, client, { chunkSize: 25 }), /staging quedó incompleta/);
  const statements = client.calls.flat();
  assert.ok(statements.some((item) => item.sql.startsWith("INSERT INTO padron_publico")));
  assert.ok(!statements.some((item) => item.sql.includes("SET status = 'active'")));
});
