import {
  Car,
  ClipboardCheck,
  Folder,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Category } from "@/lib/categories";
import type { Tone } from "@/lib/tones";

export const CATEGORY_ICON: Record<Category, LucideIcon> = {
  Insurance: ShieldCheck,
  "Utilities & bills": Zap,
  Vehicle: Car,
  "Property & compliance": ClipboardCheck,
  "Warranties & appliances": Wrench,
  "Subscriptions & services": RefreshCw,
  "Home inbox": Inbox,
  Other: Folder,
};

/** Short forms for the hub, where a bucket label has one line to live on. */
export const CATEGORY_SHORT_LABEL: Record<Category, string> = {
  Insurance: "Insurance",
  "Utilities & bills": "Utilities",
  Vehicle: "Vehicle",
  "Property & compliance": "Compliance",
  "Warranties & appliances": "Appliances",
  "Subscriptions & services": "Subscriptions",
  "Home inbox": "Inbox",
  Other: "Other",
};

/** Pastel drawer colour — filled wells use the tint; empty stays sunk. */
export const CATEGORY_TONE: Record<Category, Tone> = {
  Insurance: "sky",
  "Utilities & bills": "ochre",
  Vehicle: "lilac",
  "Property & compliance": "navy",
  "Warranties & appliances": "peach",
  "Subscriptions & services": "sage",
  "Home inbox": "ochre",
  Other: "navy",
};
