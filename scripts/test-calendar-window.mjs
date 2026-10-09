#!/usr/bin/env node
/**
 * Unit tests for lib/calendar-window.ts — no deps, run via npm run test:calendar
 * Logic mirrored here so Node can run without the TS path-alias resolver.
 */

const CALENDAR_CACHE_VERSION = 1;
const CALENDAR_MONTHS_BEFORE = 1;
const CALENDAR_MONTHS_AFTER = 3;

function monthParam(key) {
  return `${key.year}-${String(key.month).padStart(2, "0")}`;
}

function shiftMonth(key, delta) {
  const at = new Date(Date.UTC(key.year, key.month - 1 + delta, 1));
  return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1 };
}

function parseMonthKey(value, now = new Date()) {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) {
    const parts = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
    return parts;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }
  return { year, month };
}

function daysInMonth(key) {
  return new Date(Date.UTC(key.year, key.month, 0)).getUTCDate();
}

function monthBounds(key) {
  const prefix = monthParam(key);
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(daysInMonth(key)).padStart(2, "0")}`,
  };
}

function calendarWindowForAnchor(anchor) {
  const start = shiftMonth(anchor, -CALENDAR_MONTHS_BEFORE);
  const months = [];
  const span = CALENDAR_MONTHS_BEFORE + 1 + CALENDAR_MONTHS_AFTER;
  for (let i = 0; i < span; i += 1) {
    months.push(shiftMonth(start, i));
  }
  return { anchor, start, end: months[months.length - 1], months };
}

function calendarWindowFromYm(ym) {
  return calendarWindowForAnchor(parseMonthKey(ym));
}

function monthIndexInWindow(month, window) {
  const key = monthParam(month);
  return window.months.findIndex((m) => monthParam(m) === key);
}

function isMonthInWindow(month, window) {
  return monthIndexInWindow(month, window) >= 0;
}

function windowIsoBounds(window) {
  const startBounds = monthBounds(window.start);
  const endBounds = monthBounds(window.end);
  return { from: startBounds.from, to: endBounds.to };
}

function monthsToNearestEdge(month, window) {
  const idx = monthIndexInWindow(month, window);
  if (idx < 0) return -1;
  return Math.min(idx, window.months.length - 1 - idx);
}

function shouldPrefetchNextWindow(month, window, edgeThreshold = 1) {
  const idx = monthIndexInWindow(month, window);
  if (idx < 0) return null;
  if (idx <= edgeThreshold) return "start";
  if (idx >= window.months.length - 1 - edgeThreshold) return "end";
  return null;
}

function adjacentWindow(window, direction) {
  const delta =
    direction === "start" ? -CALENDAR_MONTHS_AFTER : CALENDAR_MONTHS_AFTER;
  return calendarWindowForAnchor(shiftMonth(window.anchor, delta));
}

function calendarCacheStorageKey(householdId) {
  return `hearth-calendar-v${CALENDAR_CACHE_VERSION}-${householdId}`;
}

function buildCacheEnvelope(householdId, anchorYm, payload, fetchedAt = new Date().toISOString()) {
  return { version: CALENDAR_CACHE_VERSION, householdId, fetchedAt, anchorYm, payload };
}

function parseCacheEnvelope(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.version !== CALENDAR_CACHE_VERSION) return null;
    if (!parsed.householdId || !parsed.anchorYm || !parsed.payload) return null;
    return parsed;
  } catch {
    return null;
  }
}

function dedupeById(a, b) {
  const map = new Map();
  for (const row of a) map.set(row.id, row);
  for (const row of b) map.set(row.id, row);
  return [...map.values()];
}

function mergeCalendarRawPayload(base, incoming) {
  return {
    ...base,
    people: dedupeById(base.people, incoming.people),
    schools: dedupeById(base.schools, incoming.schools),
    events: dedupeById(base.events, incoming.events),
    schoolDates: dedupeById(base.schoolDates, incoming.schoolDates),
    calendars: dedupeById(base.calendars, incoming.calendars),
    sharedDates: dedupeById(base.sharedDates, incoming.sharedDates),
    timetableSlots: dedupeById(base.timetableSlots, incoming.timetableSlots),
  };
}

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

const anchor = { year: 2026, month: 6 };
const window = calendarWindowForAnchor(anchor);

assert(window.months.length === 5, "window spans five months");
assert(window.months[0].month === 5, "window starts one month before anchor");
assert(window.months[4].month === 9, "window ends three months after anchor");
assert(isMonthInWindow({ year: 2026, month: 7 }, window), "July is inside window");
assert(!isMonthInWindow({ year: 2026, month: 4 }, window), "April is outside window");
assert(monthIndexInWindow({ year: 2026, month: 6 }, window) === 1, "anchor index");

const bounds = windowIsoBounds(window);
assert(bounds.from === "2026-05-01", "window ISO from");
assert(bounds.to === "2026-09-30", "window ISO to");

assert(monthsToNearestEdge({ year: 2026, month: 5 }, window) === 0, "edge month distance 0");
assert(monthsToNearestEdge({ year: 2026, month: 7 }, window) === 2, "middle month distance");

assert(
  shouldPrefetchNextWindow({ year: 2026, month: 5 }, window) === "start",
  "prefetch at leading edge"
);
assert(
  shouldPrefetchNextWindow({ year: 2026, month: 9 }, window) === "end",
  "prefetch at trailing edge"
);
assert(
  shouldPrefetchNextWindow({ year: 2026, month: 7 }, window) === null,
  "no prefetch in middle"
);

const fromYm = calendarWindowFromYm("2026-10");
assert(fromYm.anchor.month === 10, "parse ym anchor");

const next = adjacentWindow(window, "end");
assert(next.anchor.month === 9, "adjacent end window shifts anchor forward");

const key = calendarCacheStorageKey("hh-1");
assert(key.includes(String(CALENDAR_CACHE_VERSION)), "cache key versioned");

const envelope = buildCacheEnvelope("hh-1", "2026-06", { ok: true });
const parsed = parseCacheEnvelope(JSON.stringify(envelope));
assert(parsed?.householdId === "hh-1", "cache envelope round-trip");
assert(parseCacheEnvelope('{"version":0}') === null, "reject wrong version");

const merged = mergeCalendarRawPayload(
  {
    people: [{ id: "p1", name: "A" }],
    schools: [],
    events: [{ id: "e1" }],
    schoolDates: [],
    calendars: [],
    sharedDates: [],
    timetableSlots: [],
  },
  {
    people: [{ id: "p2", name: "B" }],
    schools: [],
    events: [{ id: "e1", title: "updated" }],
    schoolDates: [],
    calendars: [],
    sharedDates: [],
    timetableSlots: [],
  }
);
assert(merged.people.length === 2, "merge dedupes people by id");
assert(merged.events[0].title === "updated", "merge overwrites same id");

console.log(`calendar-window: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
