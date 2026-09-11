import "server-only";

/* Turning a postcode into an address somebody can pick, for the two places a
 * household types one in: their own property (/settings) and a school
 * (/family).
 *
 * Ideal Postcodes is the licensed PAF source (getAddress.io shut down in
 * Feb 2026). Needs IDEAL_POSTCODES_API_KEY. Without the key we still check
 * the postcode via free postcodes.io so a typo is caught, and say plainly
 * that the house list needs the key — the address field stays typeable.
 */

/** One line in the list the household picks from. */
export type AddressSuggestion = {
  /** Stable within a response; the client uses it as the option value. */
  id: string;
  /** The whole address on one line, which is how a picker reads. */
  label: string;
  /** The same address as separate lines, which is what fills the field. */
  lines: string[];
};

export type AddressLookup = {
  /** The postcode as it should be written: "SW1A 1AA". */
  postcode: string;
  suggestions: AddressSuggestion[];
  /** Which provider answered, so the UI can explain an empty list. */
  source: "ideal-postcodes" | "postcodes.io";
  /** A sentence to show under the results, or null if there is nothing to add. */
  message: string | null;
};

export type AddressLookupResult = AddressLookup | { error: string };

const FETCH_TIMEOUT_MS = 6_000;
/** More delivery points than any one postcode has on a single page. */
const MAX_SUGGESTIONS = 100;

/** True once an Ideal Postcodes key is set, i.e. the full picker is available. */
export function isAddressPickerConfigured(): boolean {
  return Boolean(process.env.IDEAL_POSTCODES_API_KEY?.trim());
}

/**
 * A UK postcode as it is written, or null if it isn't one. Spaces and case
 * are ignored coming in; the space before the last three characters is put
 * back, because that is the form both providers and the Royal Mail use.
 */
export function normalisePostcode(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact === "GIR0AA") return "GIR 0AA";
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/**
 * The addresses at a postcode. Never throws: a provider being down, slow or
 * cross about its quota comes back as a sentence the page can show.
 */
export async function lookupAddresses(
  raw: string
): Promise<AddressLookupResult> {
  const postcode = normalisePostcode(raw);
  if (!postcode) {
    return { error: "That doesn’t look like a UK postcode." };
  }

  const key = process.env.IDEAL_POSTCODES_API_KEY?.trim();
  return key
    ? await fromIdealPostcodes(postcode, key)
    : await fromPostcodesIo(postcode);
}

/** A JSON GET with a timeout. `null` means we never got an answer. */
async function getJson(url: string): Promise<{ status: number; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- Ideal Postcodes (licensed PAF) ---------------------------------------

type IdealAddress = {
  line_1?: unknown;
  line_2?: unknown;
  line_3?: unknown;
  post_town?: unknown;
  postcode?: unknown;
  organisation_name?: unknown;
};

type IdealPostcodesResponse = {
  code?: unknown;
  message?: unknown;
  result?: IdealAddress[];
  total?: unknown;
};

async function fromIdealPostcodes(
  postcode: string,
  key: string
): Promise<AddressLookupResult> {
  const suggestions: AddressSuggestion[] = [];
  let page = 0;
  let total = Infinity;

  while (suggestions.length < MAX_SUGGESTIONS && suggestions.length < total) {
    const url =
      `https://api.ideal-postcodes.co.uk/v1/postcodes/` +
      `${encodeURIComponent(postcode)}?api_key=${encodeURIComponent(key)}` +
      `&page=${page}`;

    const answer = await getJson(url);
    if (!answer) {
      return {
        error: "The address lookup didn’t answer. Try again in a moment.",
      };
    }

    if (answer.status === 404) {
      return { error: "We couldn’t find that postcode." };
    }
    if (answer.status === 401 || answer.status === 403) {
      console.error("[address-lookup] Ideal Postcodes rejected the key");
      return await fromPostcodesIo(postcode);
    }
    if (answer.status === 402) {
      return {
        error:
          "The address lookup is out of credit. Top up Ideal Postcodes, or type the address below.",
      };
    }
    if (answer.status === 429) {
      return { error: "The address lookup is busy. Try again in a moment." };
    }
    if (answer.status !== 200) {
      console.error("[address-lookup] Ideal Postcodes returned", answer.status);
      return {
        error: "The address lookup didn’t answer. Try again in a moment.",
      };
    }

    const body = answer.body as IdealPostcodesResponse;
    const rows = Array.isArray(body.result) ? body.result : [];
    total =
      typeof body.total === "number" && Number.isFinite(body.total)
        ? body.total
        : rows.length;

    for (const row of rows) {
      const lines = addressLines(row, postcode);
      if (lines.length === 0) continue;
      suggestions.push({
        id: String(suggestions.length),
        label: lines.join(", "),
        lines,
      });
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }

    if (rows.length === 0) break;
    page += 1;
    if (page > 20) break;
  }

  return {
    postcode,
    suggestions,
    source: "ideal-postcodes",
    message:
      suggestions.length === 0
        ? "That postcode is real, but no addresses came back for it. Type it in below."
        : null,
  };
}

function addressLines(row: IdealAddress, fallbackPostcode: string): string[] {
  const parts = [row.line_1, row.line_2, row.line_3, row.post_town]
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean);
  const pc =
    typeof row.postcode === "string" && row.postcode.trim()
      ? row.postcode.trim().toUpperCase()
      : fallbackPostcode;
  return parts.length === 0 ? [] : [...parts, pc];
}

// --- postcodes.io (no key needed) -----------------------------------------

type PostcodesIoResponse = {
  status?: number;
  result?: {
    postcode?: unknown;
    admin_district?: unknown;
    admin_ward?: unknown;
    country?: unknown;
  };
};

async function fromPostcodesIo(postcode: string): Promise<AddressLookupResult> {
  const answer = await getJson(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`
  );
  if (!answer) {
    return { error: "The postcode check didn’t answer. Try again in a moment." };
  }
  if (answer.status === 404) {
    return { error: "We couldn’t find that postcode." };
  }
  if (answer.status !== 200) {
    console.error("[address-lookup] postcodes.io returned", answer.status);
    return { error: "The postcode check didn’t answer. Try again in a moment." };
  }

  const result = (answer.body as PostcodesIoResponse)?.result ?? {};
  const where = [result.admin_ward, result.admin_district]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(", ");

  return {
    postcode,
    suggestions: [],
    source: "postcodes.io",
    message: where
      ? `${postcode} is in ${where}. Add an Ideal Postcodes key to pick the house from a list, or type the rest below.`
      : `${postcode} looks like a real postcode. Add an Ideal Postcodes key to pick the house from a list, or type the rest below.`,
  };
}
