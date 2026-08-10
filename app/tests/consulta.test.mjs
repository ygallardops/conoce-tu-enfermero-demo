import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeSearchValue, validateConsultaPayload } from "../lib/consulta.mjs";

async function render(overrides = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...overrides },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("normaliza la búsqueda y rechaza comodines", () => {
  assert.equal(normalizeSearchValue("  María   López  "), "MARIA LOPEZ");
  assert.deepEqual(
    validateConsultaPayload({ tipo: "cep", valor: "00123", turnstile_token: "local" }),
    { ok: true, value: { tipo: "cep", valor: "00123" } },
  );
  assert.equal(
    validateConsultaPayload({ tipo: "cep", valor: "D-1001", turnstile_token: "local" }).ok,
    false,
  );
  assert.equal(
    validateConsultaPayload({ tipo: "cep", valor: "123456", turnstile_token: "local" }).ok,
    true,
  );
  assert.equal(
    validateConsultaPayload({ tipo: "nombre", valor: "ANA*", turnstile_token: "local" }).ok,
    false,
  );
});

test("solo habilita iframe para origenes HTTPS explicitamente aprobados", async () => {
  const response = await render({
    ALLOWED_FRAME_ANCESTORS: "https://www.cep.org.pe, http://inseguro.example, *.example.org",
  });
  const csp = response.headers.get("content-security-policy") ?? "";

  assert.match(csp, /frame-ancestors https:\/\/www\.cep\.org\.pe/);
  assert.doesNotMatch(csp, /inseguro|\*\.example/);
  assert.equal(response.headers.get("x-frame-options"), null);
});

test("renderiza la consulta pública y elimina el starter", async () => {
  const response = await render();
  const html = await response.text();
  const [page, layout, client] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ConsultaClient.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(response.headers.get("content-security-policy") ?? "", /challenges\.cloudflare\.com/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /Conoce a tu Enfermero/);
  assert.match(html, /Prototipo personal no oficial/);
  assert.match(html, /Número CEP/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
  assert.match(page, /ConsultaClient/);
  assert.match(layout, /lang="es-PE"/);
  assert.doesNotMatch(client, /hero-promises|Sin registro|Coincidencia exacta/);
  assert.match(client, /turnstile\?\.reset/);
  assert.match(client, /setTurnstileToken\(""\)/);
  assert.match(client, /resultsHeading\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(client, /scrollIntoView/);
  assert.match(client, /tabIndex=\{-1\}/);
});

test("mantiene alineados los contratos del número CEP y el hosting", async () => {
  const [schemaText, openapi, hostingText] = await Promise.all([
    readFile(new URL("../../contracts/padron-snapshot.schema.json", import.meta.url), "utf8"),
    readFile(new URL("../../openapi/consulta-api.yaml", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);
  const schema = JSON.parse(schemaText);
  const hosting = JSON.parse(hostingText);

  assert.equal(schema.$defs.public_record.properties.num_cep.pattern, "^[0-9]{5,6}$");
  assert.match(openapi, /pattern: '\^\[0-9\]\{5,6\}\$'/);
  assert.equal(hosting.d1, "DB");
  assert.equal("r2" in hosting, false);
});

test("publica el padron desde staging sin reescribir una version", async () => {
  const source = await readFile(new URL("../lib/padron.ts", import.meta.url), "utf8");

  assert.match(source, /status = 'staging'/);
  assert.match(source, /status = 'retired'/);
  assert.match(source, /status = 'active'/);
  assert.match(source, /snapshot activo no coincide con la version canonica/i);
});

test("la API devuelve un identificador de soporte sin exponer la consulta", async () => {
  const source = await readFile(new URL("../app/api/v1/consulta/route.ts", import.meta.url), "utf8");

  assert.match(source, /"x-request-id": requestId/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
});
