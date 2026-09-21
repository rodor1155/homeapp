import { House } from "lucide-react";

const SIZE = {
  sm: { box: "h-9 w-9 rounded-lg", icon: 18 },
  md: { box: "h-11 w-11 rounded-[10px]", icon: 22 },
  lg: { box: "h-16 w-16 rounded-xl", icon: 30 },
} as const;

/** The Hearth Home mark — a house on sage tint. Used on auth and the home hero. */
export default function AppMark({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const { box, icon } = SIZE[size];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center bg-sage-tint ${box} ${className}`}
    >
      <House size={icon} strokeWidth={2} className="text-sage" />
    </span>
  );
}
