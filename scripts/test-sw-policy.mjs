#!/usr/bin/env node
/**
 * Policy tests for public/sw.js — no deps, run via npm run test:sw
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const ORIGIN = "https://app.example.com";

const swSource = readFileSync(join(root, "public/sw.js"), "utf8");
const swModule = { exports: {} };
const context = {
  self: {
    location: { origin: ORIGIN },
    addEventListener: () => {},
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve() },
  },
  module: swModule,
  exports: swModule.exports,
  console,
  caches: {
    open: async () => ({ keys: async () => [], match: async () => undefined, put: async () => {}, delete: async () => true }),
    keys: async () => [],
    delete: async () => true,
  },
  fetch: async () => new Response(),
  setTimeout,
  clearTimeout,
  Promise,
  Error,
  URL,
  Request,
  Response,
  Headers,
};
vm.runInNewContext(swSource, context, { filename: "public/sw.js" });

const {
  classify,
  pathShouldSkip,
  isStaticAsset,
  shouldCacheResponse,
  pageCacheKey,
  SKIP_PREFIXES,
  SKIP_PATHS,
} = swModule.exports;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${message}`);
}

function req(url, options = {}) {
  const method = options.method ?? "GET";
  const mode = options.mode ?? "cors";
  const headerMap = new Map(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );

  if (mode === "navigate") {
    return {
      method,
      mode,
      url,
      headers: {
        get: (name) => headerMap.get(name.toLowerCase()) ?? null,
        has: (name) => headerMap.has(name.toLowerCase()),
      },
    };
  }

  return new Request(url, {
    method,
    mode,
    headers: options.headers ?? {},
  });
}

// --- skip list ---

for (const prefix of SKIP_PREFIXES) {
  assert(
    classify(req(`${ORIGIN}${prefix}foo`)) === "skip",
    `${prefix}* should skip`,
  );
}

for (const path of SKIP_PATHS) {
  assert(
    classify(req(`${ORIGIN}${path}`)) === "skip",
    `${path} should skip`,
  );
  assert(
    classify(req(`${ORIGIN}${path}/extra`)) === "skip",
    `${path}/… should skip`,
  );
}

assert(
  classify(req(`${ORIGIN}/dashboard`, { mode: "navigate" })) === "page",
  "navigate to /dashboard should be page",
);

// --- non-GET ---

assert(
  classify(req(`${ORIGIN}/dashboard`, { method: "POST" })) === "skip",
  "POST should skip",
);

// --- cross-origin ---

assert(
  classify(req("https://other.example.com/dashboard")) === "skip",
  "cross-origin should skip",
);

// --- static ---

assert(
  classify(req(`${ORIGIN}/_next/static/chunks/main.js`)) === "static",
  "/_next/static/* should be static",
);

assert(
  classify(req(`${ORIGIN}/_next/image?url=foo`)) === "skip",
  "/_next/image should NOT be static",
);

assert(
  classify(req(`${ORIGIN}/fonts/inter.woff2`)) === "static",
  "font assets should be static",
);

assert(
  classify(req(`${ORIGIN}/icons/home.svg`)) === "static",
  "svg assets should be static",
);

assert(isStaticAsset(new URL(`${ORIGIN}/logo.png`)), "png is static asset");

// --- page: navigate + RSC ---

assert(
  classify(req(`${ORIGIN}/family`, { mode: "navigate" })) === "page",
  "navigate mode should be page",
);

assert(
  classify(
    req(`${ORIGIN}/dashboard`, { headers: { RSC: "1" } }),
  ) === "page",
  "RSC header should be page",
);

assert(
  classify(
    req(`${ORIGIN}/lists`, {
      headers: { "Next-Router-State-Tree": "abc" },
    }),
  ) === "page",
  "Next-Router-State-Tree should be page",
);

assert(
  classify(req(`${ORIGIN}/calendar?_rsc=1`)) === "page",
  "_rsc query should be page",
);

assert(
  classify(req(`${ORIGIN}/api/health`)) === "skip",
  "unknown GET under skip prefix stays skip",
);

// --- cache key separation ---

const docKey = pageCacheKey(req(`${ORIGIN}/dashboard`, { mode: "navigate" }));
const rscKey = pageCacheKey(
  req(`${ORIGIN}/dashboard`, { headers: { RSC: "1" } }),
);
assert(docKey !== rscKey, "doc and RSC keys must differ");
assert(docKey.endsWith("#doc"), "navigation key uses #doc suffix");
assert(rscKey.endsWith("#rsc"), "RSC key uses #rsc suffix");

// --- shouldCacheResponse ---

function mockResponse(overrides) {
  return {
    status: 200,
    type: "basic",
    redirected: false,
    url: `${ORIGIN}/dashboard`,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    ...overrides,
  };
}

assert(
  shouldCacheResponse(mockResponse({})),
  "200 basic html should be cacheable",
);

assert(
  shouldCacheResponse(
    mockResponse({
      headers: new Headers({ "content-type": "text/x-component" }),
    }),
  ),
  "text/x-component should be cacheable",
);

assert(
  !shouldCacheResponse(mockResponse({ status: 302 })),
  "non-200 should not cache",
);

assert(
  !shouldCacheResponse(mockResponse({ type: "cors" })),
  "non-basic should not cache",
);

assert(
  !shouldCacheResponse(
    mockResponse({
      headers: new Headers({ "content-type": "application/json" }),
    }),
  ),
  "json should not cache",
);

assert(
  !shouldCacheResponse(
    mockResponse({
      redirected: true,
      url: `${ORIGIN}/sign-in`,
    }),
  ),
  "redirect to /sign-in should not cache",
);

assert(
  shouldCacheResponse(
    mockResponse({
      redirected: true,
      url: `${ORIGIN}/dashboard`,
    }),
  ),
  "redirect to allowed path should cache",
);

assert(pathShouldSkip("/sign-in"), "pathShouldSkip /sign-in");

console.log(`sw policy: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
