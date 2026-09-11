import "server-only";

/* Turning a postcode into an address somebody can pick, for the two places a
 * household types one in: their own property (/settings) and a school
 * (/family).
 *
 * Two providers, in order of how much they can tell us:
 *
 *   getAddress.io   the real picker — every delivery point at a postcode.
 *                   Needs GETADDRESS_API_KEY, which is a paid key.
 *   postcodes.io    free and needs no key, but it only knows *about* the
 *                   postcode (is it real, which district and ward it is in).
 *                   No house numbers, so there is nothing to pick from.
 *
 * Without the key the lookup still earns its place: it catches a mistyped
 * postcode and fills the town in, and says plainly that the list of addresses
 * needs the key. The caller can always type the address by hand — this is a
 * convenience, never a gate. */

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
  source: "getaddress" | "postcodes.io";
  /** A sentence to show under the results, or null if there is nothing to add. */
  message: string | null;
};

export type AddressLookupResult = AddressLookup | { error: string };

const FETCH_TIMEOUT_MS = 6_000;
/** More delivery points than any one postcode has. */
const MAX_SUGGESTIONS = 100;

/** True once a getAddress.io key is set, i.e. the full picker is available. */
export function isAddressPickerConfigured(): boolean {
  return Boolean(process.env.GETADDRESS_API_KEY?.trim());
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

  const key = process.env.GETADDRESS_API_KEY?.trim();
  return key
    ? await fromGetAddress(postcode, key)
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
    // A 404 from either provider is a real answer ("no such postcode"), so
    // the body is read whatever the status is.
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// --- getAddress.io --------------------------------------------------------

type GetAddressResponse = {
  addresses?: {
    formatted_address?: unknown;
  }[];
};

async function fromGetAddress(
  postcode: string,
  key: string
): Promise<AddressLookupResult> {
  const url = `https://api.getaddress.io/find/${encodeURIComponent(
    postcode
  )}?expand=true&api-key=${encodeURIComponent(key)}`;

  const answer = await getJson(url);
  if (!answer) {
    return { error: "The address lookup didn’t answer. Try again in a moment." };
  }

  if (answer.status === 404) {
    return { error: "We couldn’t find that postcode." };
  }
  if (answer.status === 401 || answer.status === 403) {
    // The household can't fix this, so don't ask them to — fall back to the
    // free provider and let them type the address in.
    console.error("[address-lookup] getAddress.io rejected the key");
    return await fromPostcodesIo(postcode);
  }
  if (answer.status === 429) {
    return { error: "The address lookup is busy. Try again in a moment." };
  }
  if (answer.status !== 200) {
    console.error("[address-lookup] getAddress.io returned", answer.status);
    return { error: "The address lookup didn’t answer. Try again in a moment." };
  }

  const rows = (answer.body as GetAddressResponse)?.addresses ?? [];
  const suggestions: AddressSuggestion[] = [];

  for (const row of rows) {
    const lines = addressLines(row?.formatted_address, postcode);
    if (lines.length === 0) continue;
    suggestions.push({
      id: String(suggestions.length),
      label: lines.join(", "),
      lines,
    });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }

  return {
    postcode,
    suggestions,
    source: "getaddress",
    message:
      suggestions.length === 0
        ? "That postcode is real, but no addresses came back for it. Type it in below."
        : null,
  };
}

/**
 * getAddress.io pads `formatted_address` out to five entries with empty
 * strings, so the blanks are dropped; the postcode is added because it isn't
 * one of them.
 */
function addressLines(formatted: unknown, postcode: string): string[] {
  if (!Array.isArray(formatted)) return [];
  const lines = formatted
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === 0 ? [] : [...lines, postcode];
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

/**
 * Only validates the postcode and names the area it is in. Comes back with an
 * empty `suggestions`, and a message saying why, so the picker can be honest
 * rather than look broken.
 */
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
      ? `${postcode} is in ${where}. Picking the house from a list needs an address-lookup key, so type the rest in below.`
      : `${postcode} looks like a real postcode. Picking the house from a list needs an address-lookup key, so type the rest in below.`,
  };
}
