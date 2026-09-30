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
  pageKeyFor,
  KEY_PARAM,
  mapCacheKey,
  shouldCacheMapResponse,
  MAP_PATH,
  offlineLandingFor,
  sanitizePrimeUrls,
  SKIP_PREFIXES,
  SKIP_PATHS,
  PRIME_MAX_URLS,
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
assert(
  new URL(docKey).searchParams.get(KEY_PARAM) === "doc",
  "navigation key carries kind=doc in the query (fragments are ignored by the Cache API)",
);
assert(
  new URL(rscKey).searchParams.get(KEY_PARAM) === "rsc",
  "RSC key carries kind=rsc in the query",
);
assert(!docKey.includes("#") && !rscKey.includes("#"), "keys never use URL fragments");
assert(
  pageKeyFor(`${ORIGIN}/dashboard#frag`, "doc") === docKey,
  "a fragment on the request URL does not change the key",
);

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

// --- Home map image (the only cacheable /api route) ---

assert(MAP_PATH === "/api/home-map", "map path constant");
assert(
  classify(req(`${ORIGIN}/api/home-map?lat=51.2&lng=-0.3&style=light&t=abc`)) === "map",
  "/api/home-map is classified as map",
);
assert(classify(req(`${ORIGIN}/api/export`)) === "skip", "/api/export stays skip");
assert(classify(req(`${ORIGIN}/api/stripe/webhook`)) === "skip", "/api/stripe stays skip");
assert(
  classify(req(`${ORIGIN}/api/home-map?lat=1&lng=2`, { method: "POST" })) === "skip",
  "non-GET map request is skip",
);
assert(
  classify(req("https://evil.example/api/home-map?lat=1&lng=2")) === "skip",
  "cross-origin map request is skip",
);
assert(
  mapCacheKey(`${ORIGIN}/api/home-map?lat=51.2&lng=-0.3&style=light&t=AAA`) ===
    mapCacheKey(`${ORIGIN}/api/home-map?t=BBB&style=light&lng=-0.3&lat=51.2`),
  "map key ignores the short-lived token and parameter order",
);
assert(
  mapCacheKey(`${ORIGIN}/api/home-map?lat=51.2&lng=-0.3&style=light&t=A`) !==
    mapCacheKey(`${ORIGIN}/api/home-map?lat=51.2&lng=-0.3&style=dark&t=A`),
  "map key separates light and dark styles",
);
assert(
  !mapCacheKey(`${ORIGIN}/api/home-map?lat=1&lng=2&style=dark&t=SECRET`).includes("SECRET"),
  "map key never contains the token",
);
assert(
  shouldCacheMapResponse(mockResponse({ headers: new Headers({ "content-type": "image/png" }) })),
  "200 basic image/png map response is cacheable",
);
assert(
  !shouldCacheMapResponse(mockResponse({ status: 401, headers: new Headers({ "content-type": "text/plain" }) })),
  "401 map response is not cached",
);
assert(
  !shouldCacheMapResponse(mockResponse({ headers: new Headers({ "content-type": "text/html" }) })),
  "non-image map response is not cached",
);


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

// --- offlineLandingFor ---

assert(
  offlineLandingFor("/", ["/family", "/dashboard"]) === "/dashboard",
  "offlineLandingFor prefers /dashboard",
);

assert(
  offlineLandingFor("/", ["/calendar", "/lists"]) === "/calendar",
  "offlineLandingFor falls through candidate list in order",
);

assert(
  offlineLandingFor("/", []) === null,
  "offlineLandingFor returns null when nothing cached",
);

assert(
  offlineLandingFor("/", ["/sign-in", "/api/foo"]) === null,
  "offlineLandingFor never returns skip-listed paths",
);

assert(
  offlineLandingFor("/dashboard", ["/dashboard"]) === null,
  "offlineLandingFor only applies to /",
);

// --- sanitizePrimeUrls ---

const primeInput = [
  "/dashboard",
  "/family",
  `${ORIGIN}/calendar`,
  "https://evil.example.com/lists",
  "/sign-in",
  "/onboarding",
  "/documents",
  "/settings",
  "/hub",
  "/lists",
  "/calendar/extra",
];

const sanitized = sanitizePrimeUrls(primeInput, ORIGIN);

assert(sanitized.length === PRIME_MAX_URLS, "sanitizePrimeUrls caps at 8 URLs");

assert(
  sanitized.every((url) => url.startsWith(ORIGIN)),
  "sanitizePrimeUrls keeps same-origin URLs only",
);

assert(
  !sanitized.some((url) => {
    const path = new URL(url).pathname;
    return pathShouldSkip(path);
  }),
  "sanitizePrimeUrls rejects skip-listed paths",
);

assert(
  !sanitized.some((url) => url.includes("evil.example.com")),
  "sanitizePrimeUrls rejects cross-origin URLs",
);

console.log(`sw policy: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
