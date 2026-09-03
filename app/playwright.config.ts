import { defineConfig, devices } from "@playwright/test";

// Las pruebas se ejecutan contra un despliegue real, no contra un servidor
// levantado para la ocasion: verifican lo que ve el publico. DEMO_BASE_URL
// permite apuntarlas a otro entorno sin tocar el codigo.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "https://enfermeros-demo.yersongallardo.com",
    trace: "retain-on-failure",
    // El widget de Turnstile carga desde un dominio externo; sin margen
    // adicional una red lenta produce fallos que no son del producto.
    actionTimeout: 15_000,
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
});
