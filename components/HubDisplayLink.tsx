import Link from "next/link";

/** Settings card body — opens the kitchen iPad hub. */
export default function HubDisplayLink() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">
        Open the always-on kitchen view on a tablet — today&apos;s kit and
        dinner, who&apos;s where, meals, and what&apos;s coming up. Read-only;
        edits stay on Home and Family.
      </p>
      <Link href="/hub" className="btn w-fit">
        Open hub display
      </Link>
      <p className="text-xs text-ink-faint">
        In the iOS shell, deep link{" "}
        <code className="text-ink-soft">co.rodor.homeapp://hub</code> lands here
        when signed in.
      </p>
    </div>
  );
}
