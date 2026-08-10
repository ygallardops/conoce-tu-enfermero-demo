/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Comma-separated HTTPS origins approved to embed the application. */
  ALLOWED_FRAME_ANCESTORS?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function approvedFrameAncestors(value?: string): string {
  const origins = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin === "'self'" || /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin));

  return origins.length > 0 ? origins.join(" ") : "'none'";
}

function withSecurityHeaders(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  const frameAncestors = approvedFrameAncestors(env.ALLOWED_FRAME_ANCESTORS);
  const contentType = headers.get("content-type") ?? "";

  // Vinext emits small inline bootstrap fragments, therefore unsafe-inline is
  // deliberately scoped to scripts and styles until a nonce-capable renderer is
  // introduced. External executable content remains limited to Turnstile.
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "form-action 'self'",
      `frame-ancestors ${frameAncestors}`,
      "upgrade-insecure-requests",
    ].join("; "),
  );
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("x-permitted-cross-domain-policies", "none");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");

  // A public HTML document or JSON search response must not be retained by a
  // shared cache. Fingerprinted JS/CSS assets retain their framework cache
  // policy and carry no registry results.
  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    headers.set("cache-control", "no-store");
  }

  // X-Frame-Options complements the safe default. It is omitted when an
  // explicitly approved institutional iframe origin is configured because XFO
  // cannot express an allowlist.
  if (frameAncestors === "'none'") headers.set("x-frame-options", "DENY");
  else headers.delete("x-frame-options");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, env);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx), env);
  },
};

export default worker;
