import { expect, test } from "@playwright/test";

// Estas pruebas cubren la capa que hasta ahora solo se verificaba buscando
// cadenas en el codigo fuente del componente, lo que no demuestra
// comportamiento: bastaba renombrar una variable para romperlas, o romper la
// logica conservando el nombre para que siguieran pasando.
//
// Turnstile no se resuelve de forma automatizada, asi que no se prueba una
// consulta con resultados. Se prueba precisamente lo contrario, que es la
// garantia de seguridad: sin verificacion no se envia nada.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("presenta la consulta con el aviso de datos sinteticos", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Consulta a un profesional de enfermería" })).toBeVisible();
  await expect(page.getByText("Prototipo personal no oficial")).toBeVisible();
  await expect(page.getByText("Datos sintéticos")).toBeVisible();
});

test("no muestra el bloque de resultados antes de consultar", async ({ page }) => {
  // La ausencia importa: un bloque vacio visible sugeriria que ya se consulto.
  await expect(page.getByRole("heading", { name: "Resultado" })).toHaveCount(0);
});

test("exige un dato antes de consultar", async ({ page }) => {
  await page.getByRole("button", { name: "Consultar" }).click();

  const alerta = page.getByRole("alert");
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText("Ingresa un número CEP o un nombre completo");
  await expect(page.getByRole("heading", { name: "Resultado" })).toHaveCount(0);
});

test("no envia la consulta sin resolver la verificacion anti-bots", async ({ page }) => {
  // Garantia principal del formulario: el token de Turnstile es obligatorio
  // en el cliente, ademas de verificarse en el servidor.
  const peticiones: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/v1/consulta")) peticiones.push(req.url());
  });

  await page.getByLabel("Número de colegiatura CEP").fill("00001");
  await page.getByRole("button", { name: "Consultar" }).click();

  const alerta = page.getByRole("alert");
  await expect(alerta).toBeVisible();
  await expect(alerta).toContainText("Completa la verificación");
  expect(peticiones, "no debe salir ninguna peticion a la API").toHaveLength(0);
});

test("el campo CEP descarta lo que no sean digitos y corta en seis", async ({ page }) => {
  const campo = page.getByLabel("Número de colegiatura CEP");

  await campo.fill("");
  await campo.pressSequentially("ab12cd34ef56gh78");

  await expect(campo).toHaveValue("12345678".slice(0, 6));
});

test("cambiar de tipo de busqueda limpia el campo y ajusta la ayuda", async ({ page }) => {
  await page.getByLabel("Número de colegiatura CEP").fill("00001");

  await page.getByRole("button", { name: "Nombre completo" }).click();

  const campo = page.getByLabel("Nombre completo del profesional");
  await expect(campo).toHaveValue("");
  await expect(page.getByText("Escribe el nombre completo tal como aparece en el padrón.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nombre completo" })).toHaveAttribute("aria-pressed", "true");
});

test("el formulario es operable con teclado y tiene etiquetas asociadas", async ({ page }) => {
  const campo = page.getByLabel("Número de colegiatura CEP");
  await campo.focus();
  await expect(campo).toBeFocused();

  // Enviar con Enter desde el campo debe seguir la misma ruta que el boton.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
});
