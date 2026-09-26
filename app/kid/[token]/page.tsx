import KidView from "@/components/kid/KidView";
import { isValidKidViewToken } from "@/lib/kid-view";
import { loadKidViewForToken } from "@/lib/kid-view-load";
import { takeToken } from "@/lib/rate-limit";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your week",
  robots: { index: false, follow: false },
};

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function KidViewRateLimited() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <p className="max-w-md text-center text-xl text-ink-soft">
        Too many requests just now. Wait a minute and try again.
      </p>
    </div>
  );
}

export default async function KidViewPage(props: PageProps<"/kid/[token]">) {
  const { token } = await props.params;
  if (!isValidKidViewToken(token)) notFound();

  if (
    !takeToken(`kid-view:${token}`, {
      limit: RATE_LIMIT,
      windowMs: RATE_WINDOW_MS,
    })
  ) {
    return <KidViewRateLimited />;
  }

  const data = await loadKidViewForToken(token);
  if (!data) notFound();

  return <KidView data={data} />;
}
