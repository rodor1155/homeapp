import { redirect } from "next/navigation";
import AuthPanel from "@/components/AuthPanel";
import { loadHouseholdContext } from "@/lib/household";

export const metadata = { title: "Sign in · homeapp" };

export default async function SignInPage() {
  const { user } = await loadHouseholdContext();
  if (user) redirect("/");
  return <AuthPanel mode="sign-in" />;
}
