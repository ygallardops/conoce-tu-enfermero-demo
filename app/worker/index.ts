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

function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function contentSecurityPolicy(env: Env, nonce: string): string {
  const frameAncestors = approvedFrameAncestors(env.ALLOWED_FRAME_ANCESTORS);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

function requestWithCsp(request: Request, csp: string): Request {
  const headers = new Headers(request.headers);
  // Vinext reads the request CSP and propagates its nonce to bootstrap tags.
  headers.set("content-security-policy", csp);
  return new Request(request, { headers });
}

function isStaticAssetPath(pathname: string): boolean {
  return pathname.startsWith("/_next/") || ["/og.png", "/robots.txt", "/vinext-client-entry-manifest.json"].includes(pathname);
}

function withSecurityHeaders(response: Response, env: Env, csp: string): Response {
  const headers = new Headers(response.headers);
  const frameAncestors = approvedFrameAncestors(env.ALLOWED_FRAME_ANCESTORS);
  const contentType = headers.get("content-type") ?? "";

  headers.set("content-security-policy", csp);
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
    const nonce = createCspNonce();
    const csp = contentSecurityPolicy(env, nonce);

    // `run_worker_first` lets this Worker attach security headers to assets.
    // Vinext's server handler does not serve these files after that routing
    // change, so delegate known public assets to the ASSETS binding directly.
    if (isStaticAssetPath(url.pathname)) {
      return withSecurityHeaders(await env.ASSETS.fetch(request), env, csp);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response, env, csp);
    }

    return withSecurityHeaders(await handler.fetch(requestWithCsp(request, csp), env, ctx), env, csp);
  },
};

export default worker;
