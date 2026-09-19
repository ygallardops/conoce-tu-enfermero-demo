import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { normalizeSearchValue, validateConsultaPayload } from "../lib/consulta.mjs";
import { readRequestJson } from "../lib/http-request.mjs";
import { SITEVERIFY_URL, verifyTurnstile } from "../lib/turnstile.mjs";

async function fetchWorker(path, init = {}, overrides = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...overrides },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function render(overrides = {}) {
  return fetchWorker("/", { headers: { accept: "text/html" } }, overrides);
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
  assert.equal(
    validateConsultaPayload({ tipo: "cep", valor: "00123", turnstile_token: "local", extra: true }).ok,
    false,
  );
  assert.equal(
    validateConsultaPayload({ tipo: "cep", valor: "00123", turnstile_token: "x".repeat(4_097) }).ok,
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
  const csp = response.headers.get("content-security-policy") ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  const scriptSources = csp
    .split(";")
    .map((directive) => directive.trim().split(/\s+/))
    .find(([directive]) => directive === "script-src") ?? [];
  const scriptSourceHosts = scriptSources
    .filter((source) => URL.canParse(source))
    .map((source) => new URL(source).hostname);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.deepEqual(scriptSourceHosts, ["challenges.cloudflare.com"]);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.ok(nonce);
  assert.ok(html.includes(`nonce="${nonce}"`));
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)];
  assert.ok(inlineScripts.length > 0);
  assert.ok(inlineScripts.every((script) => script[1].includes(`nonce="${nonce}"`)));
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /Conoce a tu Enfermero/);
  assert.match(html, /Prototipo personal no oficial/);
  assert.match(html, /Número CEP/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
  assert.match(page, /ConsultaClient/);
  assert.match(layout, /lang="es-PE"/);
  assert.match(layout, /metadataBase/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /summary_large_image/);
  assert.match(layout, /og-card\.jpg/);
  assert.match(layout, /image\/jpeg/);
  assert.match(layout, /20260810-3/);
  assert.match(layout, /Conoce a tu Enfermera\(o\)/);
  assert.doesNotMatch(client, /hero-promises|Sin registro|Coincidencia exacta/);
  assert.doesNotMatch(client, /style=\{/);
  assert.match(client, /turnstile\?\.reset/);
  assert.match(client, /action: "consulta_publica"/);
  assert.doesNotMatch(client, /local-demo-token/);
  assert.match(client, /setTurnstileToken\(""\)/);
  assert.match(client, /resultsHeading\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(client, /scrollIntoView/);
  assert.match(client, /tabIndex=\{-1\}/);
});

test("publica una imagen social propia para vistas previas", async () => {
  const image = await stat(new URL("../public/og-card.jpg", import.meta.url));

  assert.ok(image.size > 20_000);
  assert.ok(image.size < 300_000);
});

test("mantiene alineados los contratos del número CEP y el hosting", async () => {
  const [schemaText, openapi, hostingText, wranglerText, viteText, assetHeaders] = await Promise.all([
    readFile(new URL("../../contracts/padron-snapshot.schema.json", import.meta.url), "utf8"),
    readFile(new URL("../../openapi/consulta-api.yaml", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/_headers", import.meta.url), "utf8"),
  ]);
  const schema = JSON.parse(schemaText);
  const hosting = JSON.parse(hostingText);

  assert.equal(schema.$defs.public_record.properties.num_cep.pattern, "^[0-9]{5,6}$");
  assert.match(openapi, /pattern: '\^\[0-9\]\{5,6\}\$'/);
  assert.match(openapi, /'413':/);
  assert.match(openapi, /'415':/);
  assert.equal(hosting.d1, "DB");
  assert.equal("r2" in hosting, false);
  assert.doesNotMatch(wranglerText, /run_worker_first/);
  assert.doesNotMatch(viteText, /compatibility_flags/);
  assert.match(assetHeaders, /Strict-Transport-Security/);
  assert.match(assetHeaders, /Content-Security-Policy: default-src 'none'/);
});

test("separa la consulta pública de la ingesta del padrón", async () => {
  const [querySource, routeSource, importerSource] = await Promise.all([
    readFile(new URL("../lib/padron.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/v1/consulta/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/data/import-d1.mjs", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(querySource, /\b(CREATE|INSERT|UPDATE|DELETE)\b/);
  assert.doesNotMatch(routeSource, /ensureDemoSnapshot|padron-snapshot\.json/);
  assert.match(importerSource, /status = 'staging'/);
  assert.match(importerSource, /status = 'retired'/);
  assert.match(importerSource, /status = 'active'/);
});

test("la API devuelve un identificador de soporte sin exponer la consulta", async () => {
  const source = await readFile(new URL("../app/api/v1/consulta/route.ts", import.meta.url), "utf8");

  assert.match(source, /"x-request-id": requestId/);
  assert.match(source, /readRequestJson/);
  assert.doesNotMatch(source, /local-demo-token/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
});

test("la verificación Turnstile exige éxito, hostname y acción, y falla cerrada", async () => {
  const config = { secret: "s3cr3t", expectedHostname: "demo.example", expectedAction: "consulta_publica" };
  const siteverify = (payload, init = {}) => async () => Response.json(payload, init);

  const casos = [
    ["éxito con hostname y acción esperados", siteverify({ success: true, hostname: "demo.example", action: "consulta_publica" }), "valid"],
    ["siteverify rechaza el token", siteverify({ success: false, "error-codes": ["invalid-input-response"] }), "invalid"],
    ["éxito resuelto en otro hostname", siteverify({ success: true, hostname: "atacante.example", action: "consulta_publica" }), "invalid"],
    ["éxito resuelto para otra acción", siteverify({ success: true, hostname: "demo.example", action: "otra_accion" }), "invalid"],
    ["éxito sin hostname ni acción", siteverify({ success: true }), "invalid"],
    ["siteverify responde con error HTTP", siteverify({}, { status: 500 }), "unavailable"],
    ["siteverify inalcanzable", async () => { throw new Error("network"); }, "unavailable"],
  ];

  for (const [motivo, fetchImpl, esperado] of casos) {
    assert.equal(await verifyTurnstile("token", config, fetchImpl), esperado, motivo);
  }

  for (const ausente of ["secret", "expectedHostname", "expectedAction"]) {
    let llamado = false;
    const outcome = await verifyTurnstile("token", { ...config, [ausente]: undefined }, async () => {
      llamado = true;
      return Response.json({ success: true, hostname: "demo.example", action: "consulta_publica" });
    });
    assert.equal(outcome, "unavailable", `sin ${ausente} la verificación no está disponible`);
    assert.equal(llamado, false, `sin ${ausente} no debe consultarse siteverify`);
  }
});

test("la verificación Turnstile envía el secreto, el token y la IP del consultante", async () => {
  const config = {
    secret: "s3cr3t",
    expectedHostname: "demo.example",
    expectedAction: "consulta_publica",
    remoteIp: "203.0.113.7",
  };
  let enviado;
  const captura = async (url, init) => {
    enviado = { url, form: init.body, signal: init.signal, method: init.method };
    return Response.json({ success: true, hostname: "demo.example", action: "consulta_publica" });
  };

  assert.equal(await verifyTurnstile("token-de-prueba", config, captura), "valid");
  assert.equal(enviado.url, SITEVERIFY_URL);
  assert.equal(enviado.method, "POST");
  assert.equal(enviado.form.get("secret"), "s3cr3t");
  assert.equal(enviado.form.get("response"), "token-de-prueba");
  assert.equal(enviado.form.get("remoteip"), "203.0.113.7");
  assert.ok(enviado.signal instanceof AbortSignal);

  await verifyTurnstile("token-de-prueba", { ...config, remoteIp: null }, captura);
  assert.equal(enviado.form.get("remoteip"), null, "sin IP no se envía el campo remoteip");
});

test("la API limita Content-Type y tamaño antes de procesar JSON", async () => {
  const unsupported = new Request("http://localhost/api/v1/consulta", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "consulta",
  });
  await assert.rejects(readRequestJson(unsupported), (error) => error?.status === 415);

  const oversized = new Request("http://localhost/api/v1/consulta", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "8193" },
    body: "{}",
  });
  await assert.rejects(readRequestJson(oversized), (error) => error?.status === 413);

  const valid = new Request("http://localhost/api/v1/consulta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });
  assert.deepEqual(await readRequestJson(valid), { ok: true });
});
