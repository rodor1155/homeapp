/* global self, caches */

// v2: page-cache keys moved from URL fragments (#doc/#rsc) to a query parameter. The Cache
// API ignores URL fragments, so "#doc" and "#rsc" collided and an RSC payload could
// overwrite (and be served as) a document. Bumping the version drops every v1 entry.
const CACHE_VERSION = "v2";
const KEY_PARAM = "__hearth";
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

const OFFLINE_LANDING_CANDIDATES = [
  "/dashboard",
  "/family",
  "/calendar",
  "/lists",
  "/documents",
  "/settings",
];

const PRIME_MAX_URLS = 8;

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
    pageKeyFor,
    KEY_PARAM,
    offlineLandingFor,
    sanitizePrimeUrls,
    SKIP_PREFIXES,
    SKIP_PATHS,
    OFFLINE_LANDING_CANDIDATES,
    PRIME_MAX_URLS,
  };
}
