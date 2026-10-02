import JSZip from "jszip";
import { getEntitlements } from "@/lib/billing";
import { queryActiveMembership } from "@/lib/household";
import { createClient } from "@/lib/supabase-server";
import { loadExportHouseholdData } from "@/app/(app)/dashboard/export-data";

export const runtime = "nodejs";
export const maxDuration = 60;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function csvFromRows(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[]
): string {
  const lines = [csvRow([...columns])];
  for (const row of rows) {
    lines.push(csvRow(columns.map((column) => row[column] ?? "")));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "You are not signed in." }, { status: 401 });
  }

  const { data: membership } = await queryActiveMembership(supabase, user.id);
  if (!membership) {
    return Response.json(
      { error: "No household found for your account." },
      { status: 400 }
    );
  }

  const entitlements = await getEntitlements(membership.household_id);
  if (!entitlements.canExport) {
    return Response.json(
      { error: "Export is a paid feature." },
      { status: 402 }
    );
  }

  const data = await loadExportHouseholdData(membership.household_id);
  if (data.error) {
    return Response.json({ error: data.error }, { status: 500 });
  }

  const zip = new JSZip();
  const today = new Date().toISOString().slice(0, 10);

  if (data.household) {
    zip.file(
      "household.csv",
      csvFromRows(["id", "name", "locale", "created_at"], [data.household])
    );
  }

  zip.file(
    "properties.csv",
    csvFromRows(
      ["id", "address", "type", "year_built", "created_at"],
      data.properties as Record<string, unknown>[]
    )
  );
  zip.file(
    "people.csv",
    csvFromRows(
      [
        "id",
        "name",
        "kind",
        "relation",
        "birthday",
        "school_id",
        "year_group",
        "notes",
        "colour",
        "sort_order",
        "created_at",
      ],
      data.people as Record<string, unknown>[]
    )
  );
  zip.file(
    "schools.csv",
    csvFromRows(
      ["id", "name", "address", "postcode", "notes", "calendar_url", "created_at"],
      data.schools as Record<string, unknown>[]
    )
  );
  zip.file(
    "events.csv",
    csvFromRows(
      [
        "id",
        "title",
        "event_date",
        "event_type",
        "person_id",
        "school_id",
        "notes",
        "created_at",
      ],
      data.events as Record<string, unknown>[]
    )
  );
  zip.file(
    "renewals.csv",
    csvFromRows(
      [
        "id",
        "person_id",
        "title",
        "kind",
        "due_date",
        "repeat_unit",
        "repeat_every",
        "remind_days",
        "reference",
        "provider",
        "cost",
        "notes",
        "source",
        "status",
        "last_done_at",
        "created_at",
        "updated_at",
      ],
      data.renewals as Record<string, unknown>[]
    )
  );
  zip.file(
    "routines.csv",
    csvFromRows(
      [
        "id",
        "title",
        "cadence",
        "weekday",
        "day_of_month",
        "anchor_date",
        "notes",
        "active",
        "sort_order",
        "created_at",
      ],
      data.routines as Record<string, unknown>[]
    )
  );
  zip.file(
    "meal_plans.csv",
    csvFromRows(
      ["id", "week_start", "weekday", "title", "ingredients_note", "sort_order", "created_at"],
      data.meals as Record<string, unknown>[]
    )
  );
  zip.file(
    "shopping_lists.csv",
    csvFromRows(
      ["id", "name", "sort_order", "created_at"],
      data.lists as Record<string, unknown>[]
    )
  );
  zip.file(
    "shopping_list_items.csv",
    csvFromRows(
      ["id", "list_id", "title", "checked", "sort_order", "created_at"],
      data.listItems as Record<string, unknown>[]
    )
  );
  zip.file(
    "timetable.csv",
    csvFromRows(
      [
        "id",
        "person_id",
        "weekday",
        "start_time",
        "end_time",
        "period_label",
        "subject",
        "location",
        "bring_kit",
        "kit_label",
        "bring_ingredients",
        "ingredients_note",
        "notes",
        "sort_order",
        "created_at",
      ],
      data.timetable as Record<string, unknown>[]
    )
  );

  zip.file(
    "README.txt",
    `Hearth Home export — ${today}\r\n\r\n` +
      `This zip is the household data Hearth Home stores on our servers: people, ` +
      `schools, key dates, renewals, routines, meal plans, shopping lists and ` +
      `timetable slots. Documents live only on your iPhone (encrypted on-device ` +
      `and synced through your own iCloud) — they are not included here.\r\n\r\n` +
      `Each CSV is one table. Open in any spreadsheet or keep as a backup.\r\n`
  );

  const body = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="hearth-home-export-${today}.zip"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
