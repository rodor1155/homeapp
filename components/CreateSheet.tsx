"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  ShoppingBasket,
  Users,
  type LucideIcon,
} from "lucide-react";
import BottomSheet from "@/components/BottomSheet";

type CreateOption = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const OPTIONS: CreateOption[] = [
  {
    href: "/documents?upload=1",
    label: "Document",
    description: "Photograph or upload a letter, bill or policy",
    icon: FileText,
  },
  {
    href: "/calendar?add=1",
    label: "Key date",
    description: "A term start, service visit or something to remember",
    icon: CalendarDays,
  },
  {
    href: "/lists?add=1",
    label: "Shopping list",
    description: "Start a list for the weekly shop or a DIY run",
    icon: ShoppingBasket,
  },
  {
    href: "/family?add=person",
    label: "Person",
    description: "Someone who lives here — birthdays hang off this",
    icon: Users,
  },
];

export default function CreateSheet({
  open,
  onClose,
  hideDocuments = false,
}: {
  open: boolean;
  onClose: () => void;
  hideDocuments?: boolean;
}) {
  const router = useRouter();
  const options = hideDocuments
    ? OPTIONS.filter((option) => !option.href.startsWith("/documents"))
    : OPTIONS;

  function pick(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add something">
      <ul className="flex flex-col gap-1 pb-2">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <li key={option.href}>
              <button
                type="button"
                onClick={() => pick(option.href)}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-paper-sunk"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-sage-tint text-sage"
                >
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {option.label}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {option.description}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.9}
                  aria-hidden
                  className="shrink-0 text-ink-faint"
                />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-rule pt-4 text-center text-xs text-ink-faint">
        Or open a tab below —{" "}
        <Link href="/documents" className="text-action" onClick={onClose}>
          Documents
        </Link>
        ,{" "}
        <Link href="/family" className="text-action" onClick={onClose}>
          Family
        </Link>
        , and the rest stay where they are.
      </p>
    </BottomSheet>
  );
}
