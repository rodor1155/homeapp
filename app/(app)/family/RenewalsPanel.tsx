"use client";

import {
  useCallback,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Car,
  FileQuestion,
  Flame,
  HeartPulse,
  Home,
  IdCard,
  Plus,
  Receipt,
  Shield,
  Tv,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  dismissRenewalSuggestion,
  markRenewalDone,
  type RenewalState,
} from "@/app/actions/renewals";
import RenewalEditSheet from "@/components/RenewalEditSheet";
import CopyButton from "@/components/CopyButton";
import { Button } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import type { DocumentRow } from "@/lib/document-types";
import type { HouseholdPerson } from "@/lib/family";
import type { Locale } from "@/lib/household";
import {
  memberColourStyle,
  personColour,
} from "@/lib/member-colours";
import {
  draftFromKind,
  RENEWAL_KIND_META,
  renewalStatusLabel,
  renewalStatusTone,
  renewalWindow,
  repeatSummary,
  suggestionsFor,
  type RenewalIconName,
  type RenewalItem,
  type RenewalKind,
} from "@/lib/renewals";

type DocOption = Pick<DocumentRow, "id" | "original_filename" | "category">;

const ICON_MAP: Record<RenewalIconName, LucideIcon> = {
  "id-card": IdCard,
  car: Car,
  "heart-pulse": HeartPulse,
  wrench: Wrench,
  receipt: Receipt,
  shield: Shield,
  home: Home,
  flame: Flame,
  tv: Tv,
  "file-question": FileQuestion,
};

type Props = {
  items: RenewalItem[];
  people: HouseholdPerson[];
  documents: DocOption[];
  locale: Locale;
  fault?: string | null;
  initialRenewalId?: string | null;
};

export default function RenewalsPanel({
  items,
  people,
  documents,
  locale,
  fault,
  initialRenewalId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedItem = initialRenewalId
    ? items.find((item) => item.id === initialRenewalId) ?? null
    : null;
  const [sheetOpen, setSheetOpen] = useState(Boolean(linkedItem));
  const [editing, setEditing] = useState<RenewalItem | null>(linkedItem);
  const [draft, setDraft] = useState<ReturnType<typeof draftFromKind> | null>(
    null
  );

  const activeItems = items.filter((item) => item.status === "active");

  const openEdit = useCallback((item: RenewalItem) => {
    setEditing(item);
    setDraft(null);
    setSheetOpen(true);
  }, []);

  const openDraft = useCallback(
    (kind: RenewalKind, person: HouseholdPerson | null) => {
      setEditing(null);
      setDraft(draftFromKind(kind, { person }));
      setSheetOpen(true);
    },
    []
  );

  const openOther = useCallback((person: HouseholdPerson | null) => {
    setEditing(null);
    setDraft(
      draftFromKind("other", {
        person,
        personName: person?.name,
      })
    );
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setEditing(null);
    setDraft(null);
    if (searchParams.get("renewal")) {
      router.replace("/family#renewals", { scroll: false });
    }
  }, [router, searchParams]);

  const houseItems = activeItems.filter((item) => item.person_id === null);

  return (
    <div id="renewals" className="flex flex-col gap-5">
      {fault ? (
        <p className="text-sm text-ink-faint">{fault}</p>
      ) : null}

      {people.length === 0 && houseItems.length === 0 ? (
        <div className="rounded-lg border border-rule bg-paper-sunk px-4 py-5">
          <p className="text-sm leading-relaxed text-ink-soft">
            Nothing tracked yet — add someone above, then start with a
            suggestion below.
          </p>
        </div>
      ) : null}

      {people.map((person) => (
        <RenewalGroup
          key={person.id}
          label={person.name}
          person={person}
          people={people}
          items={activeItems.filter((item) => item.person_id === person.id)}
          allItems={items}
          locale={locale}
          onEdit={openEdit}
          onSuggest={(kind) => openDraft(kind, person)}
          onOther={() => openOther(person)}
        />
      ))}

      <RenewalGroup
        label="The house"
        person={null}
        items={houseItems}
        allItems={items}
        locale={locale}
        onEdit={openEdit}
        onSuggest={(kind) => openDraft(kind, null)}
        onOther={() => openOther(null)}
      />

      <RenewalEditSheet
        open={sheetOpen}
        onClose={closeSheet}
        draft={draft}
        editing={editing}
        people={people}
        documents={documents}
        locale={locale}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function RenewalGroup({
  label,
  person,
  people,
  items,
  allItems,
  locale,
  onEdit,
  onSuggest,
  onOther,
}: {
  label: string;
  person: HouseholdPerson | null;
  people?: HouseholdPerson[];
  items: RenewalItem[];
  allItems: RenewalItem[];
  locale: Locale;
  onEdit: (item: RenewalItem) => void;
  onSuggest: (kind: RenewalKind, person: HouseholdPerson | null) => void;
  onOther: () => void;
}) {
  const scope = person ? "person" : "house";
  const suggestions = suggestionsFor(scope, person, allItems);
  const headerColour =
    person && people ? personColour(person, people) : null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {headerColour ? (
          <span
            aria-hidden
            className="evening-status-dot"
            style={memberColourStyle(headerColour)}
          />
        ) : null}
        {label}
      </h3>

      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">
          Nothing tracked yet — start with a suggestion below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <RenewalCard
              key={item.id}
              item={item}
              locale={locale}
              onEdit={() => onEdit(item)}
            />
          ))}
        </ul>
      )}

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {suggestions.map((kind) => (
            <SuggestionChip
              key={kind}
              kind={kind}
              personId={person?.id ?? null}
              onAdd={() => onSuggest(kind, person)}
            />
          ))}
        </div>
      ) : null}

      <Button type="button" variant="quiet" onClick={onOther}>
        <Plus size={16} aria-hidden className="mr-1 inline" />
        Add other
      </Button>
    </section>
  );
}

const STATUS_TONE_CLASS: Record<
  ReturnType<typeof renewalStatusTone>,
  string
> = {
  ochre: "text-ochre",
  oxblood: "text-oxblood",
  faint: "text-ink-faint",
};

function RenewalCard({
  item,
  locale,
  onEdit,
}: {
  item: RenewalItem;
  locale: Locale;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [markState, setMarkState] = useState<RenewalState>();
  const [markPending, startMark] = useTransition();
  const meta = RENEWAL_KIND_META[item.kind];
  const Icon = ICON_MAP[meta.icon];
  const status = renewalStatusLabel(item);
  const repeat = repeatSummary(item.repeat_unit, item.repeat_every);
  const win = renewalWindow(item);
  const windowTone = STATUS_TONE_CLASS[renewalStatusTone(item)];

  const markDone = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    startMark(async () => {
      const result = await markRenewalDone(item.id);
      setMarkState(result);
      if (result?.ok) router.refresh();
    });
  };

  return (
    <li className="rounded-lg border border-rule bg-paper-sunk">
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-ochre-tint text-ochre"
        >
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {item.title}
          </span>
          <span className="block text-xs text-ink-faint">{meta.label}</span>
          {item.due_date ? (
            <span className="tnum mt-0.5 block text-xs text-ink-soft">
              {formatDate(item.due_date, locale)}
            </span>
          ) : null}
          {repeat ? (
            <span className="block text-xs text-ink-faint">{repeat}</span>
          ) : null}
          {item.provider || item.reference ? (
            <span className="mt-0.5 block text-xs text-ink-faint">
              {[item.provider, item.reference].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className={`shrink-0 text-xs font-medium ${windowTone}`}>
          {status}
        </span>
      </button>
      {win?.inWindow ? (
        <div className="border-t border-rule px-3.5 py-2">
          {markState?.nextDue ? (
            <p className="text-sm mark-filed">
              Next due {formatDate(markState.nextDue, locale)}
            </p>
          ) : markState?.error ? (
            <p className="text-sm mark-fault">{markState.error}</p>
          ) : (
            <Button
              type="button"
              variant="quiet"
              disabled={markPending}
              className="min-h-11 w-full"
              onClick={markDone}
            >
              {markPending ? "Updating…" : "Mark done"}
            </Button>
          )}
        </div>
      ) : null}
      {item.reference ? (
        <div className="border-t border-rule px-3.5 py-1">
          <CopyButton value={item.reference} label="Copy ref" />
        </div>
      ) : null}
    </li>
  );
}

function SuggestionChip({
  kind,
  personId,
  onAdd,
}: {
  kind: RenewalKind;
  personId: string | null;
  onAdd: () => void;
  }) {
  const [pending, start] = useTransition();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const label = RENEWAL_KIND_META[kind].label;

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const dismiss = () => {
    start(async () => {
      await dismissRenewalSuggestion(kind, personId);
    });
  };

  return (
    <div className="inline-flex items-stretch rounded-pill border border-rule bg-paper">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          onAdd();
        }}
        onPointerDown={() => {
          longPressFired.current = false;
          clearTimer();
          longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            dismiss();
          }, 500);
        }}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        className="min-h-11 px-3.5 text-sm text-ink"
      >
        {label}
      </button>
      <button
        type="button"
        disabled={pending}
        aria-label={`Dismiss ${label} suggestion`}
        onClick={dismiss}
        className="btn-quiet min-h-11 min-w-11 rounded-r-pill border-l border-rule px-2"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
