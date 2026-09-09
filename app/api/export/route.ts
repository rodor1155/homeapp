import JSZip from "jszip";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
// Downloading every file in the household adds up; Hobby caps at 60s.
export const maxDuration = 60;

const EXPORT_SELECT =
  "id, storage_path, original_filename, created_at, extraction_status, doc_type, provider, reference, start_date, end_date, renewal_date, amount, currency, key_contact_name, key_contact_phone";

const CSV_COLUMNS = [
  "filename",
  "created_at",
  "extraction_status",
  "doc_type",
  "provider",
  "reference",
  "start_date",
  "end_date",
  "renewal_date",
  "amount",
  "currency",
  "key_contact_name",
  "key_contact_phone",
] as const;

type ExportRow = {
  id: string;
  storage_path: string | null;
  original_filename: string | null;
  created_at: string | null;
  extraction_status: string | null;
  doc_type: string | null;
  provider: string | null;
  reference: string | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  amount: number | string | null;
  currency: string | null;
  key_contact_name: string | null;
  key_contact_phone: string | null;
};

function safeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "");
  return cleaned.slice(-120) || "document";
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "You are not signed in." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return Response.json(
      { error: "No household found for your account." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("documents")
    .select(EXPORT_SELECT)
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: true });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const documents = (data as ExportRow[] | null) ?? [];
  const zip = new JSZip();
  const pad = Math.max(String(documents.length).length, 3);
  const csvLines = [csvRow([...CSV_COLUMNS])];
  const errors: string[] = [];

  for (const [index, doc] of documents.entries()) {
    const original = doc.original_filename ?? "document";
    const entryName = `${String(index + 1).padStart(pad, "0")}-${safeFilename(
      original
    )}`;
    let filed = false;

    if (doc.storage_path) {
      const download = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (download.error || !download.data) {
        errors.push(
          `${original} (${doc.id}): ${
            download.error?.message ?? "could not download the file"
          }`
        );
      } else {
        zip.file(`files/${entryName}`, await download.data.arrayBuffer());
        filed = true;
      }
    } else {
      errors.push(`${original} (${doc.id}): no stored file`);
    }

    csvLines.push(
      csvRow([
        filed ? entryName : original,
        doc.created_at,
        doc.extraction_status,
        doc.doc_type,
        doc.provider,
        doc.reference,
        doc.start_date,
        doc.end_date,
        doc.renewal_date,
        doc.amount,
        doc.currency,
        doc.key_contact_name,
        doc.key_contact_phone,
      ])
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  zip.file("documents.csv", `${csvLines.join("\r\n")}\r\n`);
  zip.file(
    "README.txt",
    `homeapp export — ${today}\r\n\r\nThis is everything homeapp holds for your household. The original ` +
      `document files are in the files/ folder, named in the order they were ` +
      `added. documents.csv lists one row per document, with the details read ` +
      `off each one — its filename column matches the names in files/. ` +
      `Everything here is yours to keep, open in any spreadsheet, or take ` +
      `elsewhere.\r\n`
  );
  if (errors.length > 0) {
    zip.file(
      "errors.txt",
      `These documents are listed in documents.csv but their files could not be ` +
        `included in this export:\r\n\r\n${errors.join("\r\n")}\r\n`
    );
  }

  const body = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="homeapp-export-${today}.zip"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
