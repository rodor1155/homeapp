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
  OFFLINE_LANDING_CANDIDATES,
  PRIME_MAX_URLS,
  shouldTrim,
  networkRaceDecision,
  isYoungerThan,
  PRIME_MIN_AGE_MS,
  CACHE_VERSION,
  networkFirstPage,
  networkFirstMap,
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
assert(pathShouldSkip("/settings"), "pathShouldSkip /settings");
assert(pathShouldSkip("/documents"), "pathShouldSkip /documents");
assert(
  classify(req(`${ORIGIN}/settings`, { mode: "navigate" })) === "skip",
  "/settings navigate should skip",
);
assert(
  classify(req(`${ORIGIN}/documents`, { mode: "navigate" })) === "skip",
  "/documents navigate should skip",
);
assert(CACHE_VERSION === "v3", "CACHE_VERSION is v3");

// --- shouldTrim ---

assert(!shouldTrim(1), "shouldTrim false before interval");
assert(shouldTrim(10), "shouldTrim true every 10 puts");
assert(shouldTrim(80), "shouldTrim true at page cache cap");

// --- networkRaceDecision ---

assert(
  networkRaceDecision({
    fetchSettled: true,
    fetchRejected: false,
    cachePresent: false,
    cacheExpired: true,
    timeoutFired: false,
  }) === "serve-network",
  "settled fetch serves network",
);
assert(
  networkRaceDecision({
    fetchSettled: false,
    fetchRejected: true,
    cachePresent: true,
    cacheExpired: false,
    timeoutFired: false,
  }) === "offline",
  "rejected fetch is offline",
);
assert(
  networkRaceDecision({
    fetchSettled: false,
    fetchRejected: false,
    cachePresent: true,
    cacheExpired: false,
    timeoutFired: true,
  }) === "serve-cache",
  "timeout with fresh cache serves cache",
);
assert(
  networkRaceDecision({
    fetchSettled: false,
    fetchRejected: false,
    cachePresent: false,
    cacheExpired: true,
    timeoutFired: true,
  }) === "keep-waiting",
  "timeout without cache keeps waiting",
);
assert(
  networkRaceDecision({
    fetchSettled: false,
    fetchRejected: false,
    cachePresent: true,
    cacheExpired: true,
    timeoutFired: true,
  }) === "keep-waiting",
  "timeout with expired cache keeps waiting",
);

// --- isYoungerThan ---

const now = Date.now();
assert(
  isYoungerThan(
    new Response(null, {
      headers: new Headers({ "x-hearth-cached-at": String(now - 1000) }),
    }),
    PRIME_MIN_AGE_MS,
  ),
  "recent entry is younger than prime min age",
);
assert(
  !isYoungerThan(
    new Response(null, {
      headers: new Headers({
        "x-hearth-cached-at": String(now - PRIME_MIN_AGE_MS - 1),
      }),
    }),
    PRIME_MIN_AGE_MS,
  ),
  "stale entry is not younger than prime min age",
);

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
  !OFFLINE_LANDING_CANDIDATES.includes("/documents"),
  "offline landing excludes /documents",
);
assert(
  !OFFLINE_LANDING_CANDIDATES.includes("/settings"),
  "offline landing excludes /settings",
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

assert(
  !sanitized.some((url) => new URL(url).pathname === "/settings"),
  "sanitizePrimeUrls rejects /settings",
);
assert(
  !sanitized.some((url) => new URL(url).pathname === "/documents"),
  "sanitizePrimeUrls rejects /documents",
);

const primeMany = Array.from({ length: PRIME_MAX_URLS + 3 }, (_, i) => `/tab-${i}`);
const capped = sanitizePrimeUrls(primeMany, ORIGIN);
assert(capped.length === PRIME_MAX_URLS, "sanitizePrimeUrls caps at 8 URLs");

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

// --- handler behaviour (real handlers, fake cache + network) ---
// These guard the C1/C2 rewrite: offline must still reach the cache/landing fallbacks, a slow
// network must never become a failure when nothing is cached, and the network response must be
// returned without waiting for the cache write.

function makeFakeCache() {
  const store = new Map();
  let putCount = 0;
  return {
    store,
    get putCount() {
      return putCount;
    },
    async match(key) {
      const k = typeof key === "string" ? key : key.url;
      const hit = store.get(k);
      return hit ? hit.clone() : undefined;
    },
    async put(key, response) {
      putCount += 1;
      const k = typeof key === "string" ? key : key.url;
      store.set(k, response.clone());
    },
    async keys() {
      return [...store.keys()].map((url) => ({ url }));
    },
    async delete(key) {
      const k = typeof key === "string" ? key : key.url;
      return store.delete(k);
    },
  };
}

function htmlResponse(body, status = 200) {
  const res = new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  // A same-origin network response has type "basic"; Node's `new Response()` reports "default",
  // which the worker (correctly) refuses to cache.
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
}

function navRequest(path) {
  const r = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(r, "mode", { value: "navigate" });
  return r;
}

function makeEvent() {
  const pending = [];
  return {
    waitUntil(p) {
      pending.push(Promise.resolve(p));
    },
    async settle() {
      await Promise.all(pending);
    },
  };
}

const realFetch = context.fetch;
const realSetTimeout = context.setTimeout;
// Make the 4 s network timeout fire after 20 ms so the slow-network cases run quickly.
context.setTimeout = (fn, ms) => realSetTimeout(fn, ms >= 1000 ? 20 : ms);

async function run(name, fn) {
  try {
    await fn();
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name} threw ${error && error.message}`);
  }
}

await run("offline with a cached doc", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  const req = navRequest("/dashboard");
  const key = pageCacheKey(req);
  cache.store.set(
    key,
    new Response("cached-dashboard", { headers: { "content-type": "text/html", "x-hearth-cached-at": String(Date.now()) } }),
  );
  context.fetch = async () => {
    throw new TypeError("offline");
  };
  const res = await networkFirstPage(req, makeEvent());
  assert((await res.text()) === "cached-dashboard", "offline navigation is served from the cache (fetch rejects immediately)");
});

await run("offline landing redirect for /", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  const dash = navRequest("/dashboard");
  cache.store.set(
    pageCacheKey(dash),
    new Response("cached-dashboard", { headers: { "content-type": "text/html", "x-hearth-cached-at": String(Date.now()) } }),
  );
  context.fetch = async () => {
    throw new TypeError("offline");
  };
  const res = await networkFirstPage(navRequest("/"), makeEvent());
  assert(res.status === 302, "offline '/' with a cached tab redirects");
  assert(new URL(res.headers.get("location")).pathname === "/dashboard", "offline '/' redirects to the cached tab");
});

await run("offline with nothing cached", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  context.fetch = async () => {
    throw new TypeError("offline");
  };
  let threw = false;
  try {
    await networkFirstPage(navRequest("/family"), makeEvent());
  } catch {
    threw = true;
  }
  assert(threw, "offline with no cache fails (the native shell then shows its own screen)");
});

await run("online fast", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  const event = makeEvent();
  context.fetch = async () => htmlResponse("fresh");
  const res = await networkFirstPage(navRequest("/lists"), event);
  assert((await res.text()) === "fresh", "online navigation returns the network response with a readable body");
  await event.settle();
  assert(cache.putCount === 1, "the response is cached afterwards, inside waitUntil");
});

await run("slow network, nothing cached", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  const event = makeEvent();
  context.fetch = () => new Promise((resolve) => realSetTimeout(() => resolve(htmlResponse("slow-but-ok")), 80));
  const res = await networkFirstPage(navRequest("/calendar"), event);
  assert((await res.text()) === "slow-but-ok", "a slow network with no cache is awaited, not failed");
  await event.settle();
  assert(cache.putCount === 1, "the slow response is still cached");
});

await run("slow network, cached copy", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  const req = navRequest("/dashboard");
  cache.store.set(
    pageCacheKey(req),
    new Response("old-copy", { headers: { "content-type": "text/html", "x-hearth-cached-at": String(Date.now()) } }),
  );
  const event = makeEvent();
  context.fetch = () => new Promise((resolve) => realSetTimeout(() => resolve(htmlResponse("fresh-late")), 80));
  const res = await networkFirstPage(req, event);
  assert((await res.text()) === "old-copy", "slow network with a cached copy serves the cache straight away");
  await event.settle();
  const refreshed = await cache.match(pageCacheKey(req));
  assert((await refreshed.text()) === "fresh-late", "the late network response refreshes the cache");
});

await run("rejects after the timeout, nothing cached", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  context.fetch = () => new Promise((_, reject) => realSetTimeout(() => reject(new TypeError("net down")), 80));
  let threw = false;
  try {
    await networkFirstPage(navRequest("/lists"), makeEvent());
  } catch {
    threw = true;
  }
  assert(threw, "a fetch that fails after the timeout still ends in the offline path");
});

await run("map offline and slow", async () => {
  const cache = makeFakeCache();
  context.caches.open = async () => cache;
  const url = `${ORIGIN}/api/home-map?lat=1&lng=2&style=light&t=abc`;
  cache.store.set(mapCacheKey(url), new Response("png-bytes", { headers: { "content-type": "image/png" } }));
  context.fetch = async () => {
    throw new TypeError("offline");
  };
  const res = await networkFirstMap(new Request(url), makeEvent());
  assert((await res.text()) === "png-bytes", "offline map image is served from the cache");

  const empty = makeFakeCache();
  context.caches.open = async () => empty;
  context.fetch = () =>
    new Promise((resolve) => realSetTimeout(() => resolve(new Response("slow-png", { headers: { "content-type": "image/png" } })), 80));
  const slow = await networkFirstMap(new Request(url), makeEvent());
  assert((await slow.text()) === "slow-png", "a slow map request with no cache is awaited");
});

context.fetch = realFetch;
context.setTimeout = realSetTimeout;

console.log(`sw policy: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
