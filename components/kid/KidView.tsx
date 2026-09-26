import type { CSSProperties } from "react";
import { kidViewIcon, type KidViewPayload } from "@/lib/kid-view";
import {
  memberColourInkVar,
  memberColourSoftVar,
  memberColourVar,
} from "@/lib/member-colours";
import KidViewRefresh from "./KidViewRefresh";

type Props = {
  data: KidViewPayload;
};

export default function KidView({ data }: Props) {
  const today = data.days.find((day) => day.isToday) ?? data.days[0];
  const upcoming = data.days.filter((day) => !day.isToday);
  const memberStyle = {
    "--kid-member": memberColourVar(data.colour),
    "--kid-member-soft": memberColourSoftVar(data.colour),
    "--kid-member-ink": memberColourInkVar(data.colour),
  } as CSSProperties;

  return (
    <div className="min-h-screen bg-paper px-4 py-8 sm:px-6">
      <KidViewRefresh />
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <header className="flex flex-col gap-2" style={memberStyle}>
          <h1
            className="kid-hero-heading font-[family-name:var(--font-fraunces)] text-[2.25rem] leading-tight font-semibold sm:text-4xl"
          >
            Hi {data.firstName}!
          </h1>
          <p className="tnum text-xl text-ink-soft sm:text-2xl">
            {data.todayLabel}
          </p>
          {data.birthdayCountdown ? (
            <p
              className="kid-birthday-pill rounded-lg px-4 py-3 text-lg font-medium shadow-[var(--shadow-card)] sm:text-xl"
            >
              {data.birthdayCountdown.sleeps === 0
                ? "It's your birthday today! 🎂"
                : `${data.birthdayCountdown.sleeps} ${
                    data.birthdayCountdown.sleeps === 1 ? "sleep" : "sleeps"
                  } until your birthday!`}
            </p>
          ) : null}
        </header>

        {today ? (
          <section className="card flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 className="text-[2rem] font-semibold leading-tight text-ink">
                Today
              </h2>
              {today.whosWhere ? (
                <p className="text-lg text-ink-soft">
                  You&apos;re: {today.whosWhere}
                </p>
              ) : null}
            </div>

            {today.items.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {today.items.map((item, index) => (
                  <li
                    key={`${item.kind}-${item.title}-${index}`}
                    className="flex items-start gap-4 rounded-lg bg-paper-sunk px-4 py-4"
                  >
                    <span
                      aria-hidden
                      className="text-[2rem] leading-none sm:text-[2.25rem]"
                    >
                      {kidViewIcon(item.kind)}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-xl font-medium leading-snug text-ink sm:text-[1.35rem]">
                        {item.title}
                      </p>
                      {item.subtitle ? (
                        <p className="mt-1 text-lg leading-relaxed text-ink-soft">
                          {item.subtitle}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xl leading-relaxed text-ink-soft">
                Nothing special today — have a great day!
              </p>
            )}
          </section>
        ) : null}

        {upcoming.some((day) => day.items.length > 0 || day.whosWhere) ? (
          <div className="flex flex-col gap-4">
            {upcoming.map((day) => {
              if (day.items.length === 0 && !day.whosWhere) return null;
              return (
                <section
                  key={day.date}
                  className="rounded-lg border border-rule bg-paper-raised px-4 py-4 shadow-[var(--shadow-card)] sm:px-5 sm:py-5"
                >
                  <h3 className="text-2xl font-semibold text-ink">{day.label}</h3>
                  {day.whosWhere ? (
                    <p className="mt-1 text-lg text-ink-soft">
                      You&apos;re: {day.whosWhere}
                    </p>
                  ) : null}
                  {day.items.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-2">
                      {day.items.map((item, index) => (
                        <li
                          key={`${day.date}-${item.kind}-${index}`}
                          className="flex items-start gap-3 text-lg text-ink"
                        >
                          <span aria-hidden className="text-2xl leading-none">
                            {kidViewIcon(item.kind)}
                          </span>
                          <span className="min-w-0 pt-0.5">
                            <span className="font-medium">{item.title}</span>
                            {item.subtitle ? (
                              <span className="text-ink-soft">
                                {" "}
                                · {item.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
