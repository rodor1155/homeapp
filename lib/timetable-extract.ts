import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_MODEL } from "@/lib/extraction";
import {
  asTimeHm,
  asWeekday,
  inferKitFlags,
  type TimetableSlotDraft,
  type Weekday,
} from "@/lib/timetable";

export type TimetableExtractResult =
  | { ok: true; slots: TimetableSlotDraft[]; notes: string | null }
  | { ok: false; error: string };

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

function weekdayFromRaw(value: unknown): Weekday | null {
  const direct = asWeekday(value);
  if (direct != null) return direct;
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (key in WEEKDAY_ALIASES) return WEEKDAY_ALIASES[key];
  // ISO 1–7 (Mon–Sun)
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= 7) return ((n - 1) % 7) as Weekday;
  return null;
}

function boolish(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1";
  }
  return false;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function normaliseSlot(raw: Record<string, unknown>, index: number): TimetableSlotDraft | null {
  const weekday = weekdayFromRaw(raw.weekday ?? raw.day);
  const subject = textOrNull(raw.subject ?? raw.lesson ?? raw.name);
  if (weekday == null || !subject) return null;

  let bring_kit = boolish(raw.bring_kit ?? raw.kit);
  let kit_label = textOrNull(raw.kit_label);
  let bring_ingredients = boolish(raw.bring_ingredients ?? raw.ingredients);
  let ingredients_note = textOrNull(raw.ingredients_note);

  if (!bring_kit && !bring_ingredients) {
    const inferred = inferKitFlags(subject);
    bring_kit = inferred.bring_kit;
    kit_label = kit_label ?? inferred.kit_label;
    bring_ingredients = inferred.bring_ingredients;
    ingredients_note = ingredients_note ?? inferred.ingredients_note;
  } else {
    if (bring_kit && !kit_label) kit_label = inferKitFlags(subject).kit_label ?? "PE kit";
    if (bring_ingredients && !ingredients_note) {
      ingredients_note = `Ingredients for ${subject}`;
    }
  }

  return {
    weekday,
    start_time: asTimeHm(raw.start_time ?? raw.start),
    end_time: asTimeHm(raw.end_time ?? raw.end),
    period_label: textOrNull(raw.period_label ?? raw.period),
    subject,
    location: textOrNull(raw.location ?? raw.room),
    bring_kit,
    kit_label,
    bring_ingredients,
    ingredients_note,
    notes: textOrNull(raw.notes),
    sort_order: index,
  };
}

const SYSTEM = `You extract a UK secondary-school weekly timetable from a photo, scan or pasted text.

Return every lesson you can read for a typical Mon–Fri (and weekend clubs if shown).
Rules:
- weekday: Monday=0 … Sunday=6 (or the English day name).
- subject: the lesson name as printed (e.g. "Mathematics", "PE", "Food Tech").
- start_time / end_time as HH:MM 24h when shown; otherwise null and put the period in period_label ("P1", "Period 3").
- location / room when shown.
- bring_kit true for PE, Games, swimming, textiles practicals; kit_label like "PE kit" or "Textiles kit".
- bring_ingredients true for Food Tech / Cooking; ingredients_note like "Ingredients for Food Tech".
- Do not invent lessons that are not on the timetable.
- Prefer one row per lesson occurrence (so double PE on Tuesday is two rows, or one row if printed as a double block).`;

function buildTool() {
  return {
    name: "record_timetable",
    description: "Structured weekly timetable slots for one child.",
    input_schema: {
      type: "object" as const,
      properties: {
        notes: {
          type: ["string", "null"] as unknown as "string",
          description: "Any ambiguity for the parent (which week, whose form).",
        },
        slots: {
          type: "array",
          items: {
            type: "object",
            properties: {
              weekday: {
                description: "0=Mon … 6=Sun, or Monday/Tuesday/…",
              },
              start_time: { type: ["string", "null"] as unknown as "string" },
              end_time: { type: ["string", "null"] as unknown as "string" },
              period_label: { type: ["string", "null"] as unknown as "string" },
              subject: { type: "string" },
              location: { type: ["string", "null"] as unknown as "string" },
              bring_kit: { type: "boolean" },
              kit_label: { type: ["string", "null"] as unknown as "string" },
              bring_ingredients: { type: "boolean" },
              ingredients_note: {
                type: ["string", "null"] as unknown as "string",
              },
              notes: { type: ["string", "null"] as unknown as "string" },
            },
            required: ["weekday", "subject"],
          },
        },
      },
      required: ["slots"],
    },
  };
}

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function detectImageMedia(mime: string, filename: string): ImageMedia | null {
  const m = (mime || "").toLowerCase();
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (m === "image/jpeg" || m === "image/jpg" || ext === "jpg" || ext === "jpeg")
    return "image/jpeg";
  if (m === "image/png" || ext === "png") return "image/png";
  if (m === "image/webp" || ext === "webp") return "image/webp";
  if (m === "image/gif" || ext === "gif") return "image/gif";
  return null;
}

/**
 * Extract a timetable from an image and/or pasted text via Claude vision.
 * Pure — does not touch the database. The caller shows a review UI.
 */
export async function extractTimetable(input: {
  imageBytes?: Uint8Array | null;
  mimeType?: string | null;
  filename?: string | null;
  pastedText?: string | null;
}): Promise<TimetableExtractResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Timetable scanning isn’t set up yet (no API key)." };
  }

  const pasted = (input.pastedText ?? "").trim();
  const hasImage = Boolean(input.imageBytes && input.imageBytes.byteLength > 0);
  if (!hasImage && !pasted) {
    return { ok: false, error: "Add a photo of the timetable, or paste the week." };
  }

  if (hasImage && input.imageBytes && input.imageBytes.byteLength > 12 * 1024 * 1024) {
    return { ok: false, error: "That photo is too large — try one under 12 MB." };
  }

  const media = hasImage
    ? detectImageMedia(input.mimeType ?? "", input.filename ?? "timetable.jpg")
    : null;
  if (hasImage && !media) {
    return { ok: false, error: "Use a JPEG, PNG, WebP or GIF of the timetable." };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (hasImage && media && input.imageBytes) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: media,
        data: Buffer.from(input.imageBytes).toString("base64"),
      },
    });
  }

  content.push({
    type: "text",
    text: pasted
      ? `Extract this child's weekly school timetable. Pasted text follows:\n\n${pasted}`
      : "Extract this child's weekly school timetable from the image. Use the record_timetable tool.",
  });

  try {
    const message = await client.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      tools: [buildTool()],
      tool_choice: { type: "tool", name: "record_timetable" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return { ok: false, error: "We couldn’t read a timetable from that." };
    }

    const raw = (toolUse.input ?? {}) as {
      slots?: unknown;
      notes?: unknown;
    };
    const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];
    const slots: TimetableSlotDraft[] = [];
    for (let i = 0; i < rawSlots.length; i++) {
      const row = rawSlots[i];
      if (!row || typeof row !== "object") continue;
      const slot = normaliseSlot(row as Record<string, unknown>, i);
      if (slot) slots.push(slot);
    }

    if (slots.length === 0) {
      return {
        ok: false,
        error: "No lessons came out of that — try a clearer photo or paste the week.",
      };
    }

    return {
      ok: true,
      slots,
      notes: textOrNull(raw.notes),
    };
  } catch (err) {
    console.error("[timetable-extract]", err);
    return {
      ok: false,
      error: "Scanning failed just now. You can still type the week in by hand.",
    };
  }
}
