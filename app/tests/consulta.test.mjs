import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeSearchValue, validateConsultaPayload } from "../lib/consulta.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("normaliza la búsqueda y rechaza comodines", () => {
  assert.equal(normalizeSearchValue("  María   López  "), "MARIA LOPEZ");
  assert.deepEqual(
    validateConsultaPayload({ tipo: "cep", valor: "d-1001", turnstile_token: "local" }),
    { ok: true, value: { tipo: "cep", valor: "D-1001" } },
  );
  assert.equal(
    validateConsultaPayload({ tipo: "nombre", valor: "ANA*", turnstile_token: "local" }).ok,
    false,
  );
});

test("renderiza la consulta pública y elimina el starter", async () => {
  const response = await render();
  const html = await response.text();
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(response.status, 200);
  assert.match(html, /Conoce a tu Enfermero/);
  assert.match(html, /Prototipo personal no oficial/);
  assert.match(html, /Número CEP/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
  assert.match(page, /ConsultaClient/);
  assert.match(layout, /lang="es-PE"/);
});
