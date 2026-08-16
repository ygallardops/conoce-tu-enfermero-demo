import assert from "node:assert/strict";

const baseUrl = new URL(process.env.DEMO_BASE_URL ?? "https://enfermeros-demo.yersongallardo.com");
if (baseUrl.protocol !== "https:") throw new Error("DEMO_BASE_URL debe usar HTTPS.");

function assertSecurityHeaders(response, { noStore = false } = {}) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
  if (noStore) assert.equal(response.headers.get("cache-control"), "no-store");
}

const root = await fetch(new URL("/", baseUrl), { redirect: "error" });
assert.equal(root.status, 200);
assertSecurityHeaders(root, { noStore: true });
assert.match(root.headers.get("content-security-policy") ?? "", /frame-ancestors/);

const getApi = await fetch(new URL("/api/v1/consulta", baseUrl), { method: "GET", redirect: "error" });
assert.equal(getApi.status, 405);
assert.equal(getApi.headers.get("allow"), "POST");
assert.ok(getApi.headers.get("x-request-id"));
assertSecurityHeaders(getApi, { noStore: true });

const rejectedToken = await fetch(new URL("/api/v1/consulta", baseUrl), {
  method: "POST",
  redirect: "error",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ tipo: "cep", valor: "00001", turnstile_token: "invalid-smoke-token" }),
});
assert.equal(rejectedToken.status, 403);
assert.ok(rejectedToken.headers.get("x-request-id"));
assertSecurityHeaders(rejectedToken, { noStore: true });

const socialImage = await fetch(new URL("/og-card.jpg", baseUrl), { redirect: "error" });
assert.equal(socialImage.status, 200);
assert.equal(socialImage.headers.get("content-type"), "image/jpeg");
assertSecurityHeaders(socialImage);

console.log(JSON.stringify({
  target: baseUrl.origin,
  checks: ["root", "api-method", "api-turnstile-rejection", "social-image"],
  status: "ok",
}));
