"use client";

import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import {
  MEMBER_COLOURS,
  type MemberColourKey,
} from "@/lib/member-colours";

type Props = {
  name?: string;
  value: MemberColourKey;
  onChange: (key: MemberColourKey) => void;
  disabled?: boolean;
};

export default function MemberColourPicker({
  name = "colour",
  value,
  onChange,
  disabled = false,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Colour"
      className="flex flex-wrap gap-2"
    >
      {MEMBER_COLOURS.map(({ key, label, cssVar }) => {
        const selected = value === key;
        return (
          <label
            key={key}
            className={`member-colour-swatch ${selected ? "member-colour-swatch--selected" : ""}`}
            style={{ "--swatch-fill": cssVar } as CSSProperties}
          >
            <input
              type="radio"
              name={name}
              value={key}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(key)}
              className="member-colour-swatch-input"
            />
            <span className="member-colour-swatch-fill" aria-hidden />
            {selected ? (
              <Check
                size={18}
                strokeWidth={2.5}
                aria-hidden
                className="member-colour-swatch-check"
              />
            ) : null}
            <span className="sr-only">{label}</span>
          </label>
        );
      })}
    </div>
  );
}
