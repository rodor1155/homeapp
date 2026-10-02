/* global self, caches */

// v3: /settings and /documents are never cached (secrets + server-rendered doc data).
// Bumping the version drops every v2 entry, including any cached /settings HTML.
const CACHE_VERSION = "v3";
const KEY_PARAM = "__hearth";
const STATIC_CACHE = `hearth-static-${CACHE_VERSION}`;
const PAGE_CACHE = `hearth-pages-${CACHE_VERSION}`;
const MEDIA_CACHE = `hearth-media-${CACHE_VERSION}`;
// The one /api route that is safe to cache: the Home hero map image. It is a GET-only
// PNG derived from rounded coordinates; nothing else under /api is ever cached.
const MAP_PATH = "/api/home-map";
const PAGE_CACHE_MAX_ENTRIES = 80;
const PAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const STATIC_CACHE_MAX_ENTRIES = 200;
const NETWORK_TIMEOUT_MS = 4000;
const PRIME_MIN_AGE_MS = 6 * 60 * 60 * 1000;
const TRIM_EVERY_N_PUTS = 10;
const CACHED_AT_HEADER = "x-hearth-cached-at";

const SKIP_PREFIXES = [
  "/api/",
  "/auth/",
  "/kid/",
  "/join/",
  "/internal/",
];

const SKIP_PATHS = [
  "/invite",
  "/account-deletion",
  "/account-deleted",
  "/sign-in",
  "/sign-up",
  "/onboarding",
  "/privacy",
  "/settings",
  "/documents",
];

const OFFLINE_LANDING_CANDIDATES = [
  "/dashboard",
  "/family",
  "/calendar",
  "/lists",
];

const PRIME_MAX_URLS = 8;

const STATIC_EXTENSIONS =
  /\.(woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i;

/** @returns {string} */
function parseBuildId() {
  try {
    const url = new URL(self.location.href);
    return url.searchParams.get("v") || "dev";
  } catch {
    return "dev";
  }
}

const BUILD_ID = parseBuildId();

/** @param {string} buildId */
function staticCacheName(buildId) {
  return `${STATIC_CACHE}-${buildId}`;
}

/** @param {number} putCounter */
function shouldTrim(putCounter) {
  return (
    putCounter % TRIM_EVERY_N_PUTS === 0 ||
    putCounter >= PAGE_CACHE_MAX_ENTRIES
  );
}

/**
 * Decide how to proceed when a network-first fetch races a timeout.
 * @param {{
 *   fetchSettled: boolean;
 *   fetchRejected: boolean;
 *   cachePresent: boolean;
 *   cacheExpired: boolean;
 *   timeoutFired: boolean;
 * }} state
 * @returns {"serve-network" | "serve-cache" | "keep-waiting" | "offline"}
 */
function networkRaceDecision(state) {
  if (state.fetchSettled && !state.fetchRejected) return "serve-network";
  if (state.fetchRejected) return "offline";
  if (state.timeoutFired) {
    if (state.cachePresent && !state.cacheExpired) return "serve-cache";
    return "keep-waiting";
  }
  return "keep-waiting";
}

/** @param {string} pathname */
function pathShouldSkip(pathname) {
  for (const prefix of SKIP_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  for (const path of SKIP_PATHS) {
    if (pathname === path || pathname.startsWith(`${path}/`)) return true;
  }
  return false;
}

/**
 * Pick the first cached tab path for an offline cold launch at `/`.
 * @param {string} pathname
 * @param {Iterable<string>} cachedDocPaths
 * @returns {string | null}
 */
function offlineLandingFor(pathname, cachedDocPaths) {
  if (pathname !== "/") return null;

  const cached = new Set(cachedDocPaths);
  for (const path of OFFLINE_LANDING_CANDIDATES) {
    if (pathShouldSkip(path)) continue;
    if (cached.has(path)) return path;
  }
  return null;
}

/**
 * @param {unknown} urls
 * @param {string} origin
 * @returns {string[]}
 */
function sanitizePrimeUrls(urls, origin) {
  if (!Array.isArray(urls)) return [];

  const result = [];
  for (const item of urls) {
    if (result.length >= PRIME_MAX_URLS) break;
    if (typeof item !== "string") continue;

    let url;
    try {
      url = new URL(item, origin);
    } catch {
      continue;
    }

    if (url.origin !== origin) continue;
    if (pathShouldSkip(url.pathname)) continue;
    result.push(url.href);
  }

  return result;
}

/**
 * @param {URL} url
 * @returns {boolean}
 */
function isStaticAsset(url) {
  const { pathname } = url;
  if (pathname.startsWith("/_next/static/")) return true;
  return STATIC_EXTENSIONS.test(pathname);
}

/**
 * @param {Request} request
 * @returns {"skip" | "static" | "page" | "map"}
 */
function classify(request) {
  if (request.method !== "GET") return "skip";

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return "skip";
  // Must precede the skip list, which covers all of /api/.
  if (url.pathname === MAP_PATH) return "map";
  if (pathShouldSkip(url.pathname)) return "skip";
  if (isStaticAsset(url)) return "static";

  if (request.mode === "navigate") return "page";

  if (request.headers.get("RSC") === "1") return "page";
  if (request.headers.has("Next-Router-State-Tree")) return "page";
  if (url.searchParams.has("_rsc")) return "page";

  return "skip";
}

/**
 * Cache key for the Home map image. The request carries a short-lived signed token `t`
 * that changes on every page render, so it is dropped: the image is identified by its
 * coordinates and style only (a cached page from any render then finds the same image).
 * @param {string} absoluteUrl
 */
function mapCacheKey(absoluteUrl) {
  const url = new URL(absoluteUrl);
  const key = new URL(url.origin + url.pathname);
  for (const name of ["lat", "lng", "style"]) {
    const value = url.searchParams.get(name);
    if (value !== null) key.searchParams.set(name, value);
  }
  return key.href;
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function shouldCacheMapResponse(response) {
  if (response.status !== 200) return false;
  if (response.type !== "basic") return false;
  return (response.headers.get("content-type") || "").startsWith("image/");
}

/**
 * Synthetic cache key so RSC payloads never collide with document navigations.
 * @param {Request} request
 */
function pageCacheKey(request) {
  const url = new URL(request.url);
  const isRsc =
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc");
  return pageKeyFor(request.url, isRsc ? "rsc" : "doc");
}

/**
 * Synthetic cache key. The kind lives in a query parameter because the Cache API ignores
 * URL fragments (tested: put(x#doc) then put(x#rsc) leaves one entry, matched by both).
 * @param {string} absoluteUrl
 * @param {"doc" | "rsc"} kind
 */
function pageKeyFor(absoluteUrl, kind) {
  const url = new URL(absoluteUrl);
  url.hash = "";
  url.searchParams.set(KEY_PARAM, kind);
  return url.href;
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function shouldCacheResponse(response) {
  if (response.status !== 200) return false;
  if (response.type !== "basic") return false;

  if (response.redirected) {
    const finalUrl = new URL(response.url);
    if (pathShouldSkip(finalUrl.pathname)) return false;
  }

  const contentType = response.headers.get("content-type") || "";
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("text/x-component")
  ) {
    return false;
  }

  return true;
}

/**
 * @param {Response} response
 * @returns {Response}
 */
function withCachedTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function isExpired(response) {
  const raw = response.headers.get(CACHED_AT_HEADER);
  if (!raw) return true;
  const cachedAt = Number(raw);
  if (!Number.isFinite(cachedAt)) return true;
  return Date.now() - cachedAt > PAGE_CACHE_MAX_AGE_MS;
}

/**
 * @param {Response | undefined} response
 * @param {number} minAgeMs
 * @returns {boolean}
 */
function isYoungerThan(response, minAgeMs) {
  if (!response) return false;
  const raw = response.headers.get(CACHED_AT_HEADER);
  if (!raw) return false;
  const cachedAt = Number(raw);
  if (!Number.isFinite(cachedAt)) return false;
  return Date.now() - cachedAt < minAgeMs;
}

let pagePutCounter = 0;

/**
 * @param {ExtendableEvent} event
 * @param {Cache} cache
 * @param {string} key
 * @param {Response} response
 */
function schedulePageCachePut(event, cache, key, response) {
  pagePutCounter += 1;
  const runTrim = shouldTrim(pagePutCounter);
  event.waitUntil(
    (async () => {
      await cache.put(key, withCachedTimestamp(response));
      if (runTrim) await trimPageCache(cache);
    })(),
  );
}

/**
 * @param {Cache} cache
 * @param {string} key
 * @param {Response} response
 */
async function putPageEntry(cache, key, response) {
  pagePutCounter += 1;
  const runTrim = shouldTrim(pagePutCounter);
  await cache.put(key, withCachedTimestamp(response));
  if (runTrim) await trimPageCache(cache);
}

/**
 * Drop oldest entries when over cap.
 * @param {Cache} cache
 */
async function trimPageCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= PAGE_CACHE_MAX_ENTRIES) return;

  const dated = await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request);
      const raw = response?.headers.get(CACHED_AT_HEADER);
      const cachedAt = raw ? Number(raw) : 0;
      return { request, cachedAt: Number.isFinite(cachedAt) ? cachedAt : 0 };
    }),
  );

  dated.sort((a, b) => a.cachedAt - b.cachedAt);
  const excess = dated.length - PAGE_CACHE_MAX_ENTRIES;
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(dated[i].request);
  }
}

/**
 * Drop oldest static entries when over cap (insertion order from cache.keys()).
 * @param {Cache} cache
 */
async function trimStaticCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= STATIC_CACHE_MAX_ENTRIES) return;

  const excess = keys.length - STATIC_CACHE_MAX_ENTRIES;
  for (let i = 0; i < excess; i += 1) {
    await cache.delete(keys[i]);
  }
}

/**
 * @param {Cache} cache
 * @param {string} origin
 * @returns {Promise<string[]>}
 */
async function cachedDocPathnames(cache, origin) {
  const keys = await cache.keys();
  const paths = [];

  for (const request of keys) {
    const url = new URL(request.url);
    if (url.origin !== origin) continue;
    if (url.searchParams.get(KEY_PARAM) !== "doc") continue;
    if (pathShouldSkip(url.pathname)) continue;

    const response = await cache.match(request);
    if (!response || isExpired(response)) continue;
    paths.push(url.pathname);
  }

  return paths;
}

/**
 * @param {string} absoluteUrl
 * @returns {Promise<boolean>}
 */
async function primePageUrl(absoluteUrl) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageKeyFor(absoluteUrl, "doc");
  const existing = await cache.match(key);
  if (isYoungerThan(existing, PRIME_MIN_AGE_MS)) return false;

  try {
    const response = await fetch(absoluteUrl, {
      headers: { Accept: "text/html" },
      cache: "no-store",
      credentials: "same-origin",
    });

    if (!shouldCacheResponse(response)) return false;
    await putPageEntry(cache, key, response.clone());
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Request} request
 * @param {ExtendableEvent} event
 * @returns {Promise<Response>}
 */
async function cacheFirstStatic(request, event) {
  const cache = await caches.open(staticCacheName(BUILD_ID));
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    event.waitUntil(
      (async () => {
        await cache.put(request, response.clone());
        await trimStaticCache(cache);
      })(),
    );
  }
  return response;
}

/**
 * @param {Request} request
 * @param {Cache} cache
 * @param {string} key
 * @returns {Promise<Response>}
 */
async function handlePageOffline(request, cache, key) {
  const cached = await cache.match(key);
  if (cached && !isExpired(cached)) return cached;
  if (cached) await cache.delete(key);

  if (request.mode === "navigate") {
    const url = new URL(request.url);
    const docPaths = await cachedDocPathnames(cache, url.origin);
    const landing = offlineLandingFor(url.pathname, docPaths);
    if (landing) {
      return Response.redirect(new URL(landing, request.url).href, 302);
    }
  }

  throw new Error("offline");
}

/**
 * Network-first for documents and RSC payloads.
 *
 * - The response is returned the moment the network answers; caching happens in `waitUntil`
 *   (a clone must be read in full, which would otherwise block streaming).
 * - The network is raced against NETWORK_TIMEOUT_MS only to decide whether a CACHED copy may be
 *   served early. With no usable cache the fetch is awaited to its end (a slow network or a cold
 *   start must not turn into a failure). A fetch that REJECTS (offline) goes straight to the
 *   offline path: cached copy, then the "/" landing redirect, then failure.
 * @param {Request} request
 * @param {ExtendableEvent} event
 * @returns {Promise<Response>}
 */
async function networkFirstPage(request, event) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageCacheKey(request);

  // Never rejects, so a late rejection after we have moved on cannot become unhandled.
  const settled = fetch(request).then(
    (response) => ({ kind: "fetch", response }),
    () => ({ kind: "rejected" }),
  );

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), NETWORK_TIMEOUT_MS);
  });
  const first = await Promise.race([settled, timeout]);
  clearTimeout(timer);

  if (first.kind === "fetch") {
    if (shouldCacheResponse(first.response)) {
      schedulePageCachePut(event, cache, key, first.response.clone());
    }
    return first.response;
  }
  if (first.kind === "rejected") {
    return handlePageOffline(request, cache, key);
  }

  // The timeout fired first.
  const cached = await cache.match(key);
  const decision = networkRaceDecision({
    fetchSettled: false,
    fetchRejected: false,
    cachePresent: Boolean(cached),
    cacheExpired: cached ? isExpired(cached) : true,
    timeoutFired: true,
  });

  if (decision === "serve-cache" && cached) {
    // Serve the cache now; let the late network response refresh it.
    event.waitUntil(
      settled.then((late) => {
        if (late.kind === "fetch" && shouldCacheResponse(late.response)) {
          schedulePageCachePut(event, cache, key, late.response.clone());
        }
      }),
    );
    return cached;
  }

  // Nothing usable in the cache: keep waiting for the network.
  const late = await settled;
  if (late.kind === "fetch") {
    if (shouldCacheResponse(late.response)) {
      schedulePageCachePut(event, cache, key, late.response.clone());
    }
    return late.response;
  }
  return handlePageOffline(request, cache, key);
}

/**
 * Network-first with a cache fallback for the Home map image (see MAP_PATH). Same timeout and
 * offline semantics as networkFirstPage.
 * @param {Request} request
 * @param {ExtendableEvent} event
 * @returns {Promise<Response>}
 */
async function networkFirstMap(request, event) {
  const cache = await caches.open(MEDIA_CACHE);
  const key = mapCacheKey(request.url);

  const settled = fetch(request).then(
    (response) => ({ kind: "fetch", response }),
    () => ({ kind: "rejected" }),
  );

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), NETWORK_TIMEOUT_MS);
  });
  const first = await Promise.race([settled, timeout]);
  clearTimeout(timer);

  const offline = async () => {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw new Error("offline");
  };

  if (first.kind === "fetch") {
    if (shouldCacheMapResponse(first.response)) {
      event.waitUntil(cache.put(key, first.response.clone()));
    }
    return first.response;
  }
  if (first.kind === "rejected") {
    return offline();
  }

  const cached = await cache.match(key);
  if (cached) {
    event.waitUntil(
      settled.then((late) => {
        if (late.kind === "fetch" && shouldCacheMapResponse(late.response)) {
          return cache.put(key, late.response.clone());
        }
      }),
    );
    return cached;
  }

  const late = await settled;
  if (late.kind === "fetch") {
    if (shouldCacheMapResponse(late.response)) {
      event.waitUntil(cache.put(key, late.response.clone()));
    }
    return late.response;
  }
  return offline();
}

/** @param {string} name */
function isHearthCache(name) {
  return name.startsWith("hearth-");
}

/** @param {string} name */
function isStaleStaticCache(name) {
  return name.startsWith(`${STATIC_CACHE}-`) && name !== staticCacheName(BUILD_ID);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (isHearthCache(name) &&
                name !== staticCacheName(BUILD_ID) &&
                name !== PAGE_CACHE &&
                name !== MEDIA_CACHE) ||
              isStaleStaticCache(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const kind = classify(event.request);
  if (kind === "skip") return;

  if (kind === "static") {
    event.respondWith(cacheFirstStatic(event.request, event));
    return;
  }

  if (kind === "map") {
    event.respondWith(networkFirstMap(event.request, event));
    return;
  }

  event.respondWith(networkFirstPage(event.request, event));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-caches") {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter(isHearthCache).map((name) => caches.delete(name)),
        );
        if (event.source) {
          event.source.postMessage({ type: "clear-caches-done" });
        }
      })(),
    );
    return;
  }

  if (event.data?.type === "prime-pages") {
    event.waitUntil(
      (async () => {
        const urls = sanitizePrimeUrls(event.data.urls, self.location.origin);
        let cached = 0;

        for (const url of urls) {
          if (await primePageUrl(url)) cached += 1;
        }

        if (event.source) {
          event.source.postMessage({ type: "prime-pages-done", cached });
        }
      })(),
    );
  }
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    classify,
    pathShouldSkip,
    isStaticAsset,
    shouldCacheResponse,
    pageCacheKey,
    mapCacheKey,
    shouldCacheMapResponse,
    MAP_PATH,
    pageKeyFor,
    KEY_PARAM,
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
    STATIC_CACHE_MAX_ENTRIES,
    CACHE_VERSION,
    networkFirstPage,
    networkFirstMap,
  };
}
