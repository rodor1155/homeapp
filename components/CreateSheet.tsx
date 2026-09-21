"use client";

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
    <BottomSheet
      open={open}
      onClose={onClose}
      title="What are you adding?"
      className="max-h-[min(72dvh,520px)]"
    >
      <ul className="flex flex-col divide-y divide-rule">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <li key={option.href}>
              <button
                type="button"
                onClick={() => pick(option.href)}
                className="flex min-h-[3.5rem] w-full items-center gap-3 py-4 text-left transition-colors hover:bg-paper-sunk"
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
    </BottomSheet>
  );
}
