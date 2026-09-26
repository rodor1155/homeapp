import sharp from "sharp";
import {
  roundCoord,
  verifyHomeMapToken,
  HOME_MAP_COORD_DECIMALS,
} from "@/lib/home-map";
import { cacheGet, cacheSet, takeToken } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase-server";

/* Stitches a map mosaic around the home so the hero can show the road and
   area without shipping a map SDK. Light (default) or dark (`style=dark`) for
   the evening-map Home screen. Auth: signed short-lived token from
   resolveHomeMap, or a signed-in session. */

export const runtime = "nodejs";

const ZOOM = 16;
const TILE = 256;
/** 5×4 at z16 — full-bleed on phone and desktop hero. */
const COLS = 5;
const ROWS = 4;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "HearthHome/1.0 (https://homeapp-mu.vercel.app; family home app)";
const STITCH_CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

type MapStyle = "light" | "dark";

const DARK_GROUND = { r: 20, g: 28, b: 46 };
const LIGHT_GROUND = { r: 245, g: 242, b: 235 };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latRaw = Number(url.searchParams.get("lat"));
  const lngRaw = Number(url.searchParams.get("lng"));
  const token = url.searchParams.get("t") ?? "";
  const style = parseStyle(url.searchParams.get("style"));

  if (
    !Number.isFinite(latRaw) ||
    !Number.isFinite(lngRaw) ||
    latRaw < -85 ||
    latRaw > 85 ||
    lngRaw < -180 ||
    lngRaw > 180
  ) {
    return new Response("Bad coordinates", { status: 400 });
  }

  const lat = roundCoord(latRaw);
  const lng = roundCoord(lngRaw);

  const tokenOk = verifyHomeMapToken(token, lat, lng);
  if (!tokenOk) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response("Sign in first.", { status: 401 });
    }
    const bucket = `home-map:user:${user.id}`;
    if (!takeToken(bucket, { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS })) {
      return new Response("Too many map requests.", { status: 429 });
    }
  } else {
    const bucket = `home-map:token:${lat.toFixed(HOME_MAP_COORD_DECIMALS)}:${lng.toFixed(HOME_MAP_COORD_DECIMALS)}`;
    if (!takeToken(bucket, { limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS })) {
      return new Response("Too many map requests.", { status: 429 });
    }
  }

  const cacheKey = `home-map:png:v2:${style}:${lat.toFixed(HOME_MAP_COORD_DECIMALS)}:${lng.toFixed(HOME_MAP_COORD_DECIMALS)}`;
  const cached = cacheGet<Buffer>(cacheKey);
  if (cached) {
    return pngResponse(cached);
  }

  try {
    const png = await stitchMap(lat, lng, style);
    cacheSet(cacheKey, png, STITCH_CACHE_TTL_MS);
    return pngResponse(png);
  } catch (error) {
    console.error("[home-map] stitch failed", error);
    return new Response("Map unavailable", { status: 502 });
  }
}

function parseStyle(raw: string | null): MapStyle {
  return raw === "dark" ? "dark" : "light";
}

function pngResponse(png: Buffer): Response {
  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=86400",
    },
  });
}

async function stitchMap(
  lat: number,
  lng: number,
  style: MapStyle
): Promise<Buffer> {
  const centre = latLngToWorldPixel(lat, lng, ZOOM);
  const width = COLS * TILE;
  const height = ROWS * TILE;
  const originX = centre.x - width / 2;
  const originY = centre.y - height / 2;
  const n = 2 ** ZOOM;

  const startTileX = Math.floor(originX / TILE);
  const startTileY = Math.floor(originY / TILE);
  const endTileX = Math.floor((originX + width - 1) / TILE);
  const endTileY = Math.floor((originY + height - 1) / TILE);

  const fetches: Promise<{ left: number; top: number; buffer: Buffer }>[] = [];

  for (let ty = startTileY; ty <= endTileY; ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = startTileX; tx <= endTileX; tx += 1) {
      const wrappedX = ((tx % n) + n) % n;
      const left = tx * TILE - originX;
      const top = ty * TILE - originY;
      fetches.push(
        fetchTile(ZOOM, wrappedX, ty, style).then((buffer) => ({
          left,
          top,
          buffer,
        }))
      );
    }
  }

  const tiles = await Promise.all(fetches);
  const composites = tiles.map((tile) => ({
    input: tile.buffer,
    left: Math.round(tile.left),
    top: Math.round(tile.top),
  }));

  const background = style === "dark" ? DARK_GROUND : LIGHT_GROUND;

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 8 })
    .toBuffer();
}

function cartoBasemapKey(): string | null {
  return process.env.CARTO_BASEMAPS_API_KEY?.trim() || null;
}

async function fetchTile(
  z: number,
  x: number,
  y: number,
  style: MapStyle
): Promise<Buffer> {
  const cartoKey = cartoBasemapKey();
  let tileUrl: string;
  if (cartoKey) {
    const subdomain = ["a", "b", "c", "d"][(x + y) % 4]!;
    const variant = style === "dark" ? "dark_all" : "voyager";
    tileUrl =
      `https://${subdomain}.basemaps.cartocdn.com/rastertiles/${variant}/${z}/${x}/${y}.png` +
      `?key=${encodeURIComponent(cartoKey)}`;
  } else {
    tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(tileUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "image/png" },
      next: { revalidate: 604_800 },
    });
    if (!response.ok) {
      throw new Error(`tile ${z}/${x}/${y} → ${response.status}`);
    }
    const raw = Buffer.from(await response.arrayBuffer());
    if (style === "dark" && !cartoKey) {
      return recolorOsmDark(raw);
    }
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

const NAVY_GROUND = { r: 20, g: 28, b: 46 };
const SLATE_ROAD_A = { r: 62, g: 76, b: 104 };
const SLATE_ROAD_B = { r: 86, g: 100, b: 127 };
const MUTED_LABEL = { r: 124, g: 137, b: 163 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(lerp(from.r, to.r, t)),
    g: Math.round(lerp(from.g, to.g, t)),
    b: Math.round(lerp(from.b, to.b, t)),
  };
}

function pixelLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** OSM raster → deep navy ground with slate streets (no Carto key). */
async function recolorOsmDark(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf)
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const pixels = data;

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const lum = pixelLuminance(r, g, b);
    const t = lum / 255;

    let out: { r: number; g: number; b: number };

    if (t >= 0.94) {
      const roadT = Math.min(1, (t - 0.94) / 0.06);
      out = lerpRgb(SLATE_ROAD_A, SLATE_ROAD_B, roadT);
    } else if (t >= 0.72) {
      const landT = (t - 0.72) / 0.22;
      const coolBias = Math.max(-1, Math.min(1, (b - r) / 48));
      const parkWater = {
        r: NAVY_GROUND.r + coolBias * -4,
        g: NAVY_GROUND.g + coolBias * 2,
        b: NAVY_GROUND.b + coolBias * 8,
      };
      const curved = Math.pow(landT, 0.55);
      out = lerpRgb(parkWater, lerpRgb(NAVY_GROUND, SLATE_ROAD_A, curved * 0.35), landT);
    } else if (t >= 0.28) {
      const midT = (t - 0.28) / 0.44;
      const inv = Math.pow(1 - midT, 0.72);
      out = lerpRgb(MUTED_LABEL, NAVY_GROUND, inv);
    } else {
      const darkT = t / 0.28;
      out = lerpRgb(
        { r: 14, g: 18, b: 28 },
        MUTED_LABEL,
        Math.pow(darkT, 0.45)
      );
    }

    pixels[i] = out.r;
    pixels[i + 1] = out.g;
    pixels[i + 2] = out.b;
  }

  return sharp(pixels, { raw: { width, height, channels } })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n * TILE;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    n *
    TILE;
  return { x, y };
}
