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
