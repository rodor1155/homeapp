import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "@/lib/household";
import { effectiveCategory } from "@/lib/categories";
import {
  documentLabel,
  parseAmount,
  type OverviewDocument,
} from "@/lib/home-overview";

// Small, cheap and quick — this is a two-sentence paragraph, not extraction.
export const SUMMARY_MODEL = "claude-haiku-4-5";

const MAX_DOCUMENTS = 40;
const REQUEST_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You write a short summary of what a household has on file, for the top of their home overview page.

Rules:
- 2 to 4 sentences of plain English prose. No markdown, no bullet points, no headings, no preamble.
- Plain-spoken and domestic in tone. Never salesy, never a status report.
- Use only the documents listed. Never invent a provider, date, amount or document that is not in the list.
- Lead with whatever is coming up soonest, then give a sense of what is on file overall.
- Refer to money using the currency given. Do not add up amounts yourself unless the total is obvious.
- Address the household as "you".`;

function describe(doc: OverviewDocument): string {
  const parts = [documentLabel(doc), effectiveCategory(doc)];

  if (doc.doc_type?.trim()) parts.push(doc.doc_type.trim());
  if (doc.renewal_date) parts.push(`renews ${doc.renewal_date}`);
  if (doc.end_date) parts.push(`ends ${doc.end_date}`);

  const amount = parseAmount(doc.amount);
  if (amount !== null) {
    parts.push(`${amount}${doc.currency ? ` ${doc.currency}` : ""}`);
  }

  return `- ${parts.join(" | ")}`;
}

/**
 * A short prose summary of the household's paperwork. Best-effort and
 * disposable: any failure (or no documents, or no API key) returns null and
 * the caller omits the section. Nothing is persisted, and only the structured
 * fields are sent — never document text.
 */
export async function summariseHome(input: {
  documents: readonly OverviewDocument[];
  locale: Locale;
  today?: Date;
}): Promise<string | null> {
  if (input.documents.length === 0) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const today = (input.today ?? new Date()).toISOString().slice(0, 10);
  const lines = input.documents.slice(0, MAX_DOCUMENTS).map(describe);

  try {
    const client = new Anthropic();
    const message = await client.messages.create(
      {
        model: SUMMARY_MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              `Today is ${today}. The household is in the ${
                input.locale === "US" ? "United States" : "United Kingdom"
              }.`,
              "",
              "Each line is: name | category | type | dates | amount.",
              ...lines,
              "",
              "Write the summary.",
            ].join("\n"),
          },
        ],
      },
      { timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 }
    );

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();

    return text || null;
  } catch {
    return null;
  }
}
