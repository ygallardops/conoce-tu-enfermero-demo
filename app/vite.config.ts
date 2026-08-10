import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const brandProfile = process.env.PUBLIC_BRAND_PROFILE ?? "demo";
// A Turnstile site key is public configuration, unlike the server-side secret.
// Keep the demo key as a build fallback so an ad-hoc production build cannot
// silently omit the human-verification widget when no local .env is loaded.
const turnstileSiteKey =
  process.env.PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAELgOttEQExh7l1W";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

const buildBindingConfig = {
  ...localBindingConfig,
  compatibility_flags: [],
  d1_databases: [],
  r2_buckets: [],
};

export default defineConfig(async ({ command }) => {
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
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        // The placeholder bindings make local development self-contained. During
        // a production build, Wrangler must receive only the real bindings from
        // wrangler.jsonc or it emits duplicate D1 bindings in dist/server.
        config: command === "serve" ? localBindingConfig : buildBindingConfig,
      }),
    ],
  };
});
