import vinext from "vinext";
import { defineConfig } from "vite";

const brandProfile = process.env.PUBLIC_BRAND_PROFILE ?? "demo";
// A Turnstile site key is public configuration, unlike the server-side secret.
// Keep the demo key as a build fallback so an ad-hoc production build cannot
// silently omit the human-verification widget when no local .env is loaded.
const turnstileSiteKey =
  process.env.PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAELgOttEQExh7l1W";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      __BRAND_PROFILE__: JSON.stringify(brandProfile),
      __TURNSTILE_SITE_KEY__: JSON.stringify(turnstileSiteKey),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        // wrangler.jsonc points `main` at the built bundle, which is what gets
        // deployed. Vite compiles the Worker from its source instead. Bindings
        // come only from wrangler.jsonc, in development and in the build.
        config: { main: "./worker/index.ts" },
      }),
    ],
  };
});
