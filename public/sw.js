/* global self, caches */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `hearth-static-${CACHE_VERSION}`;
const PAGE_CACHE = `hearth-pages-${CACHE_VERSION}`;
const PAGE_CACHE_MAX_ENTRIES = 80;
const PAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const NETWORK_TIMEOUT_MS = 4000;
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
];

const STATIC_EXTENSIONS =
  /\.(woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i;

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
 * @returns {"skip" | "static" | "page"}
 */
function classify(request) {
  if (request.method !== "GET") return "skip";

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return "skip";
  if (pathShouldSkip(url.pathname)) return "skip";
  if (isStaticAsset(url)) return "static";

  if (request.mode === "navigate") return "page";

  if (request.headers.get("RSC") === "1") return "page";
  if (request.headers.has("Next-Router-State-Tree")) return "page";
  if (url.searchParams.has("_rsc")) return "page";

  return "skip";
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
  return `${request.url}#${isRsc ? "rsc" : "doc"}`;
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
 * @param {Cache} cache
 * @param {string} key
 * @param {Response} response
 */
async function putPageEntry(cache, key, response) {
  await cache.put(key, withCachedTimestamp(response));
  await trimPageCache(cache);
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
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageCacheKey(request);

  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS);
      }),
    ]);

    if (shouldCacheResponse(response)) {
      await putPageEntry(cache, key, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached && !isExpired(cached)) return cached;
    if (cached) await cache.delete(key);
    throw new Error("offline");
  }
}

/** @param {string} name */
function isHearthCache(name) {
  return name.startsWith("hearth-");
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
              isHearthCache(name) &&
              name !== STATIC_CACHE &&
              name !== PAGE_CACHE,
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
    event.respondWith(cacheFirstStatic(event.request));
    return;
  }

  event.respondWith(networkFirstPage(event.request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "clear-caches") return;

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
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    classify,
    pathShouldSkip,
    isStaticAsset,
    shouldCacheResponse,
    pageCacheKey,
    SKIP_PREFIXES,
    SKIP_PATHS,
  };
}
