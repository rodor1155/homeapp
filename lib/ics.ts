import "server-only";

import { promises as dns } from "node:dns";
import * as https from "node:https";
import { expandRecurringEvent, sync as ical, type VEvent } from "node-ical";
import { CALENDAR_WINDOW_DAYS, startOfCalendarDay } from "@/lib/family";

/* Reading somebody else's ICS feed: the URL we are willing to store, the
 * fetch, and the parse. Feed-agnostic on purpose — a school's term dates
 * (lib/school-calendar.ts) and a household's own shared calendar
 * (lib/household-calendar.ts) differ only in which table the occurrences are
 * cached in, so all the careful part lives here once.
 *
 * Everything a household could see is a short sentence: the fetch talks to a
 * URL somebody typed in, so the detail (status codes, DNS, redirect chains)
 * stays in the server log and never reaches the page. */

/** A single feed can't fill the household's calendar on its own. */
export const MAX_EVENTS_PER_FEED = 200;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
/** Stop reading a feed that is mostly noise long before the sort. */
const MAX_OCCURRENCES = 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** An error whose message is safe to put in front of a household. */
export class CalendarError extends Error {}

// --- the URL --------------------------------------------------------------

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

/**
 * A calendar link as we are willing to store it: HTTPS only, with the
 * `webcal://` scheme every school website and Google's "secret address" hand
 * out rewritten to it. Returns a sentence for the household on anything else.
 */
export function normaliseCalendarUrl(
  raw: string
): { url: string } | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Paste the calendar link." };

  const withScheme = /^webcal:\/\//i.test(trimmed)
    ? `https://${trimmed.slice("webcal://".length)}`
    : trimmed;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "That doesn’t look like a calendar link." };
  }

  if (url.protocol !== "https:") {
    return { error: "The link has to start with https:// or webcal://." };
  }
  if (url.username || url.password) {
    return { error: "Use a link without a username or password in it." };
  }
  if (isBlockedHostname(url.hostname)) {
    return { error: "That link points somewhere we can’t reach." };
  }

  return { url: url.toString() };
}

/**
 * Hostnames we refuse on sight: the loopback names, the mDNS/internal
 * suffixes, and anything without a dot (which is a machine on somebody's
 * network, not a calendar). The address behind the name is checked
 * separately, at fetch time.
 */
function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  if (/\.(local|localhost|internal|intranet|home|lan)$/.test(host)) return true;
  if (isIpLiteral(host)) return isPrivateAddress(host);
  return !host.includes(".");
}

function isIpLiteral(host: string): boolean {
  return /^[\d.]+$/.test(host) || host.includes(":");
}

/**
 * Best-effort "this is not on our own network". Paired with the pinned
 * connect in fetchCalendar so a rebind between resolve and dial is refused.
 */
function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();

  // IPv4, including the ::ffff:10.0.0.1 form of it.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  const v4 = mapped ? mapped[1] : /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
  if (v4) {
    const [a, b] = v4.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }

  if (ip === "::" || ip === "::1") return true;
  // Unique-local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8).
  return /^(f[cd]|fe[89ab]|ff)/.test(ip);
}

type PinnedHost = {
  /** Hostname for the TLS SNI / Host header. */
  hostname: string;
  /** Public A/AAAA answers we will allow the socket to dial. */
  addresses: { address: string; family: 4 | 6 }[];
};

/**
 * Resolve the host and refuse private answers. Returns the public addresses
 * so the connect can pin them — closing the DNS-rebinding window between
 * lookup and dial as far as Node lets us.
 */
async function resolvePublicHost(url: URL): Promise<PinnedHost> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (isIpLiteral(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new CalendarError("That link points somewhere we can’t reach.");
    }
    const family: 4 | 6 = hostname.includes(":") ? 6 : 4;
    return { hostname, addresses: [{ address: hostname, family }] };
  }

  let answers: { address: string; family: number }[];
  try {
    answers = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new CalendarError("We couldn’t find that calendar address.");
  }

  const addresses = answers
    .filter((entry) => entry.family === 4 || entry.family === 6)
    .map((entry) => ({
      address: entry.address,
      family: (entry.family === 6 ? 6 : 4) as 4 | 6,
    }))
    .filter((entry) => !isPrivateAddress(entry.address));

  if (addresses.length === 0) {
    throw new CalendarError("That link points somewhere we can’t reach.");
  }

  return { hostname, addresses };
}

// --- the fetch ------------------------------------------------------------

/**
 * The feed's text, with a timeout, a size cap, every redirect hop checked the
 * same way the first URL was, and the dial pinned to the public addresses we
 * resolved up front (so a DNS rebind between lookup and connect can't sneak
 * us onto a private network).
 */
export async function fetchCalendar(startUrl: string): Promise<string> {
  let url = new URL(startUrl);

  for (let hop = 0; ; hop++) {
    const pinned = await resolvePublicHost(url);
    const response = await pinnedHttpsGet(url, pinned);

    const location = response.headers.location;
    if (response.statusCode >= 300 && response.statusCode < 400 && location) {
      if (hop >= MAX_REDIRECTS) {
        throw new CalendarError("That calendar link redirects too many times.");
      }
      const next = normaliseCalendarUrl(new URL(location, url).toString());
      if ("error" in next) throw new CalendarError(next.error);
      url = new URL(next.url);
      continue;
    }

    if (response.statusCode !== 200) {
      throw new CalendarError(
        response.statusCode === 401 || response.statusCode === 403
          ? "That calendar needs a password, so we can’t read it."
          : response.statusCode === 404
            ? "That calendar link doesn’t exist any more."
            : "The calendar didn’t give us anything."
      );
    }

    const declared = Number(response.headers["content-length"] ?? "");
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new CalendarError("That calendar is too big for us to read.");
    }

    return readCapped(response.body);
  }
}

type PinnedResponse = {
  statusCode: number;
  headers: { location?: string; "content-length"?: string };
  body: Buffer;
};

/**
 * HTTPS GET that dials only the pre-resolved public addresses. Node skips a
 * custom `lookup` when `hostname` is already an IP literal, so we pin by
 * putting the vetted IP in `hostname` (the TCP peer) while `servername` (SNI)
 * and the Host header keep the original DNS name — that is what makes TLS
 * and virtual-hosting work for real school ICS hosts.
 */
function pinnedHttpsGet(url: URL, pinned: PinnedHost): Promise<PinnedResponse> {
  const addresses = pinned.addresses;
  let attempt = 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    let activeRequest: ReturnType<typeof https.request> | null = null;
    let activeResponse: { destroy: () => void } | null = null;

    // https.request `timeout` is socket inactivity only — a trickling body
    // never trips it. This wall-clock deadline covers dial + headers + body.
    const hardTimer = setTimeout(() => {
      fail(new CalendarError("The calendar took too long to answer."));
    }, FETCH_TIMEOUT_MS);

    const succeed = (value: PinnedResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      resolve(value);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      activeResponse?.destroy();
      activeRequest?.destroy();
      reject(error);
    };

    const tryNext = () => {
      if (settled) return;
      const target = addresses[attempt];
      if (!target) {
        fail(new CalendarError("We couldn’t reach that calendar."));
        return;
      }
      attempt += 1;

      const request = https.request(
        {
          protocol: "https:",
          // Dial the vetted public IP directly (no second DNS / no rebind).
          hostname: target.address,
          family: target.family,
          // SNI + Host stay on the original name the certificate expects.
          servername: pinned.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: {
            host: pinned.hostname,
            accept: "text/calendar, text/plain, */*",
          },
          // Inactivity timeout (complements the hard wall-clock above).
          timeout: FETCH_TIMEOUT_MS,
        },
        (response) => {
          if (settled) {
            response.destroy();
            return;
          }
          activeResponse = response;
          const chunks: Buffer[] = [];
          let size = 0;
          let rejected = false;
          response.on("data", (chunk: Buffer) => {
            if (settled) return;
            size += chunk.byteLength;
            if (size > MAX_BYTES) {
              rejected = true;
              response.destroy();
              fail(
                new CalendarError("That calendar is too big for us to read.")
              );
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (rejected || settled) return;
            succeed({
              statusCode: response.statusCode ?? 0,
              headers: {
                location: headerValue(response.headers.location),
                "content-length": headerValue(
                  response.headers["content-length"]
                ),
              },
              body: Buffer.concat(chunks),
            });
          });
          response.on("error", () => {
            if (!rejected && !settled) tryNext();
          });
        }
      );

      activeRequest = request;
      request.on("timeout", () => {
        request.destroy();
        fail(new CalendarError("The calendar took too long to answer."));
      });
      request.on("error", () => {
        if (!settled) tryNext();
      });
      request.end();
    };

    tryNext();
  });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** The body as text, once we already capped it on the wire. */
function readCapped(body: Buffer): string {
  const text = body.toString("utf8");
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new CalendarError("That link isn’t a calendar file.");
  }
  return text;
}

// --- the parse ------------------------------------------------------------

export type ParsedCalendarEvent = {
  uid: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
};

export type ParsedCalendar = {
  /** The feed's own name (X-WR-CALNAME), if it has one. */
  title: string | null;
  events: ParsedCalendarEvent[];
};

/** node-ical hands back either the value or `{ val, params }`. */
function plainValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object" && "val" in value) {
    const inner = (value as { val: unknown }).val;
    return typeof inner === "string" ? inner.trim() || null : null;
  }
  return null;
}

/**
 * An all-day occurrence is a calendar date, not an instant: node-ical gives
 * it back as local midnight, so the day is read off the local components and
 * re-pinned to UTC midnight. Timed occurrences are real instants and kept as
 * they are.
 */
function occurrenceInstant(date: Date, allDay: boolean): Date {
  if (!allDay) return date;
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
}

/**
 * Every occurrence in the window, recurring rules expanded, soonest first and
 * capped. Nothing in here throws: a single unreadable event is skipped rather
 * than losing the whole feed.
 */
export function parseCalendar(
  ics: string,
  now: Date = new Date(),
  windowDays: number = CALENDAR_WINDOW_DAYS
): ParsedCalendar {
  const parsed = ical.parseICS(ics);
  const from = new Date(startOfCalendarDay(now));
  const to = new Date(from.getTime() + windowDays * DAY_MS);

  const byKey = new Map<string, ParsedCalendarEvent>();
  const loose: ParsedCalendarEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (byKey.size + loose.length >= MAX_OCCURRENCES) break;
    if (!component || component.type !== "VEVENT") continue;

    const event = component as VEvent;
    if (event.status === "CANCELLED") continue;

    let instances: ReturnType<typeof expandRecurringEvent>;
    try {
      instances = expandRecurringEvent(event, { from, to });
    } catch {
      continue;
    }

    for (const instance of instances) {
      const allDay = instance.isFullDay;
      const startsAt = occurrenceInstant(instance.start, allDay);
      if (Number.isNaN(startsAt.getTime())) continue;
      if (startsAt < from || startsAt > to) continue;

      const endsAt =
        instance.end instanceof Date && !Number.isNaN(instance.end.getTime())
          ? occurrenceInstant(instance.end, allDay)
          : null;

      const entry: ParsedCalendarEvent = {
        uid: event.uid
          ? instance.isRecurring
            ? `${event.uid}@${startsAt.toISOString()}`
            : event.uid
          : null,
        title: (plainValue(instance.summary) ?? "Untitled").slice(0, 300),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
        allDay,
        location: plainValue(event.location)?.slice(0, 300) ?? null,
      };

      if (entry.uid) byKey.set(entry.uid, entry);
      else loose.push(entry);
    }
  }

  const events = [...byKey.values(), ...loose]
    .sort(
      (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title)
    )
    .slice(0, MAX_EVENTS_PER_FEED);

  return { title: plainValue(parsed.vcalendar?.["WR-CALNAME"]), events };
}

/** The feed, fetched and parsed. The one call a sync makes. */
export async function readCalendarFeed(
  url: string,
  now: Date = new Date()
): Promise<ParsedCalendar> {
  return parseCalendar(await fetchCalendar(url), now);
}
