/* The drawn house: in the hero, and again in the "nothing filed yet" card. */

export default function HouseIllustration({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 112 80"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
    >
      <circle cx="90" cy="18" r="11" className="fill-sage-soft" opacity="0.22" />
      <path
        d="M8 70h96"
        className="stroke-rule-strong"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M26 36v34h60V36"
        className="fill-paper-raised stroke-ink"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M14 40 56 8l42 32"
        className="stroke-ink"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M46 70V52h20v18"
        className="fill-sage-soft stroke-ink"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect
        x="33"
        y="44"
        width="10"
        height="10"
        rx="2"
        className="fill-sage-tint stroke-ink"
        strokeWidth="2.5"
      />
      <rect
        x="69"
        y="44"
        width="10"
        height="10"
        rx="2"
        className="fill-sage-tint stroke-ink"
        strokeWidth="2.5"
      />
    </svg>
  );
}
