import { redirect } from "next/navigation";
import { loadHouseholdContext } from "@/lib/household";
import ExtractionTester from "./ExtractionTester";

export const metadata = { title: "Extraction test · homeapp" };

// Internal benchmark tool. Not linked from anywhere in the product UI.
export default async function ExtractionTestPage() {
  const { user } = await loadHouseholdContext();
  if (!user) redirect("/sign-in");

  const allow = process.env.INTERNAL_TOOLS_EMAILS;
  if (allow) {
    const list = allow.split(",").map((e) => e.trim().toLowerCase());
    if (!user.email || !list.includes(user.email.toLowerCase())) {
      redirect("/dashboard");
    }
  }

  return <ExtractionTester />;
}
