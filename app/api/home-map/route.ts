import sharp from "sharp";

/* Stitches a small Carto Voyager mosaic around the home so the hero can show
   the road and area without shipping a map SDK. One GET, one PNG, long cache.
   Attribution stays on the hero ("© OSM · Carto"). */

export const runtime = "nodejs";

const ZOOM = 16;
const TILE = 256;
/** 3×2 tiles → 768×512 — enough road context for a hero underlay. */
const COLS = 3;
const ROWS = 2;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "homeapp/1.0 (https://homeapp-mu.vercel.app; family home app)";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -85 ||
    lat > 85 ||
    lng < -180 ||
    lng > 180
  ) {
    return new Response("Bad coordinates", { status: 400 });
  }

  try {
    const png = await stitchMap(lat, lng);
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // Pin the place for a week at the edge; browsers keep it a day.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[home-map] stitch failed", error);
    return new Response("Map unavailable", { status: 502 });
  }
}

async function stitchMap(lat: number, lng: number): Promise<Buffer> {
  const centre = latLngToTile(lat, lng, ZOOM);
  const originX = centre.x - Math.floor(COLS / 2);
  const originY = centre.y - Math.floor(ROWS / 2);
  const n = 2 ** ZOOM;

  const fetches: Promise<{ left: number; top: number; buffer: Buffer }>[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = ((originX + col) % n + n) % n;
      const y = originY + row;
      if (y < 0 || y >= n) continue;
      const left = col * TILE;
      const top = row * TILE;
      fetches.push(
        fetchTile(ZOOM, x, y).then((buffer) => ({ left, top, buffer }))
      );
    }
  }

  const tiles = await Promise.all(fetches);
  const composites = tiles.map((tile) => ({
    input: tile.buffer,
    left: tile.left,
    top: tile.top,
  }));

  return sharp({
    create: {
      width: COLS * TILE,
      height: ROWS * TILE,
      channels: 3,
      background: { r: 245, g: 242, b: 235 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 8 })
    .toBuffer();
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  // Carto Voyager: soft, street-labelled, close to the paper/ink palette.
  const subdomain = ["a", "b", "c", "d"][(x + y) % 4]!;
  const tileUrl = `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(tileUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "image/png" },
      // Tiles never move for a given z/x/y.
      next: { revalidate: 604_800 },
    });
    if (!response.ok) {
      throw new Error(`tile ${z}/${x}/${y} → ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}
