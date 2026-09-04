import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildImportPlan, readValidationOptions } from "./import-d1.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "../..");
const snapshotPath = resolve(appDir, "data/demo/canonical/padron-snapshot.json");

function sqlLiteral(value) {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function renderStaticStatement(item) {
  const fragments = item.sql.split("?");
  if (fragments.length - 1 !== item.params.length) throw new Error("Cantidad de parámetros SQL inconsistente.");
  return fragments.map((fragment, index) => (
    index < item.params.length ? `${fragment}${sqlLiteral(item.params[index])}` : fragment
  )).join("");
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: appDir,
      env: {
        ...process.env,
        WRANGLER_WRITE_LOGS: "false",
        WRANGLER_LOG_PATH: resolve(appDir, ".wrangler/logs"),
        MINIFLARE_REGISTRY_PATH: resolve(appDir, ".wrangler/registry"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let standardOutput = "";
    let errorOutput = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      standardOutput = `${standardOutput}${chunk}`;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      errorOutput = `${errorOutput}${chunk}`.slice(-4000);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise(standardOutput);
      else reject(new Error(`Wrangler finalizó con código ${code}.${errorOutput ? ` ${errorOutput.trim()}` : ""}`));
    });
  });
}

async function main() {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  if (!snapshot.source.startsWith("demo:")) {
    throw new Error("La inicialización local acepta únicamente snapshots sintéticos demo.");
  }
  const plan = buildImportPlan(snapshot, { validationOptions: readValidationOptions() });
  const importedAt = new Date().toISOString();
  const staging = {
    sql: `INSERT INTO padron_snapshots (
      dataset_version, schema_version, generated_at, source, record_count,
      checksum_sha256, status, imported_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'staging', ?)
    ON CONFLICT(dataset_version) DO UPDATE SET
      schema_version = excluded.schema_version,
      generated_at = excluded.generated_at,
      source = excluded.source,
      record_count = excluded.record_count,
      checksum_sha256 = excluded.checksum_sha256,
      status = 'staging',
      imported_at = excluded.imported_at`,
    params: [
      snapshot.dataset_version,
      snapshot.schema_version,
      snapshot.generated_at,
      snapshot.source,
      snapshot.record_count,
      snapshot.checksum_sha256,
      importedAt,
    ],
  };
  const statements = [
    ...plan.schema,
    staging,
    plan.resetStaging,
    ...plan.recordBatches.flat(),
    ...plan.activate,
  ];
  const sql = `${statements.map(renderStaticStatement).join(";\n")} ;\n`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "cep-d1-local-"));
  const sqlPath = join(temporaryDirectory, "synthetic-seed.sql");
  const wranglerPath = resolve(appDir, "node_modules/wrangler/bin/wrangler.js");
  try {
    await writeFile(sqlPath, sql, { encoding: "utf8", flag: "wx" });
    await run(process.execPath, [
      wranglerPath,
      "d1",
      "execute",
      "DB",
      "--local",
      "--file",
      sqlPath,
      "--yes",
    ]);
    const verificationOutput = await run(process.execPath, [
      wranglerPath,
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `SELECT candidate.dataset_version, candidate.status, candidate.record_count,
        (SELECT COUNT(*) FROM padron_publico records
          WHERE records.dataset_version = candidate.dataset_version) AS persisted_count
      FROM padron_snapshots candidate
      WHERE candidate.status = 'active'
      ORDER BY candidate.generated_at DESC LIMIT 1`,
      "--json",
    ]);
    const verification = JSON.parse(verificationOutput)?.[0]?.results?.[0];
    if (
      verification?.dataset_version !== snapshot.dataset_version
      || verification.status !== "active"
      || Number(verification.record_count) !== snapshot.record_count
      || Number(verification.persisted_count) !== snapshot.record_count
    ) {
      throw new Error("Wrangler no confirmó el snapshot sintético activo en D1 local.");
    }
    console.log(`D1 local inicializada con ${snapshot.record_count} registros sintéticos.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
