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

/** Drawer colour — ink / sage / navy first; pastels only as quiet kind markers. */
export const CATEGORY_TONE: Record<Category, Tone> = {
  Insurance: "navy",
  "Utilities & bills": "ochre",
  Vehicle: "navy",
  "Property & compliance": "navy",
  "Warranties & appliances": "sage",
  "Subscriptions & services": "sage",
  "Home inbox": "ochre",
  Other: "sage",
};
