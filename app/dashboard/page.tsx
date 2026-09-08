import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { requireOnboarded } from "@/lib/household";

export const metadata = { title: "Dashboard · homeapp" };

export default async function DashboardPage() {
  const { user, household, property } = await requireOnboarded();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{household.name}</h1>
          <p className="text-sm opacity-70">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Property
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm">{property.address}</p>
        <p className="mt-1 text-sm opacity-70">
          {[property.type, property.year_built ? `Built ${property.year_built}` : null]
            .filter(Boolean)
            .join(" · ") || "No further details yet"}
        </p>
        <p className="mt-1 text-xs opacity-50">Locale: {household.locale}</p>
      </section>

      <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Documents
        </h2>
        <p className="mt-2 text-sm opacity-70">
          Upload insurance, warranty, and utility paperwork so it is all in one
          place.
        </p>
        <Link
          href="/documents"
          className="mt-3 inline-block rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          Go to documents
        </Link>
      </section>

      <p className="text-xs opacity-50">
        Dashboard, reminders, and document extraction come in later phases.
      </p>
    </main>
  );
}
