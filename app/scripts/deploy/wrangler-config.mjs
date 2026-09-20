import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "../..");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const sourceConfigPath = resolve(appDir, "wrangler.jsonc");
export const deployConfigPath = resolve(appDir, "wrangler.deploy.jsonc");

export function withDatabaseId(configText, databaseId) {
  let config;
  try {
    config = JSON.parse(configText);
  } catch {
    throw new Error("wrangler.jsonc dejó de ser JSON plano; este generador no admite comentarios.");
  }
  if (!uuidPattern.test(databaseId ?? "")) {
    throw new Error("CLOUDFLARE_D1_DATABASE_ID ausente o con un formato distinto de un UUID.");
  }
  const bindings = config.d1_databases;
  if (!Array.isArray(bindings) || bindings.length !== 1) {
    throw new Error("Se espera exactamente un binding de D1 en wrangler.jsonc.");
  }
  if ("database_id" in bindings[0]) {
    throw new Error("wrangler.jsonc no debe versionar database_id: lo inyecta este generador.");
  }

  return `${JSON.stringify({
    ...config,
    d1_databases: [{ ...bindings[0], database_id: databaseId }],
  }, null, 2)}\n`;
}

export async function generateDeployConfig(runtimeEnv = process.env) {
  const configText = await readFile(sourceConfigPath, "utf8");
  await writeFile(deployConfigPath, withDatabaseId(configText, runtimeEnv.CLOUDFLARE_D1_DATABASE_ID), "utf8");
  return deployConfigPath;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedAsScript) {
  generateDeployConfig()
    .then((path) => console.log(path))
    .catch((error) => {
      // El identificador no es secreto, pero tampoco hace falta imprimirlo.
      console.error(`No se pudo preparar la configuración de despliegue: ${error.message}`);
      process.exitCode = 1;
    });
}
