import { redirect } from "next/navigation";
import AuthPanel from "@/components/AuthPanel";
import { loadHouseholdContext } from "@/lib/household";
import { safeNextPath } from "@/lib/safe-path";

export const metadata = { title: "Sign in · homeapp" };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next } = await props.searchParams;
  const target = safeNextPath(next);

  const { user } = await loadHouseholdContext();
  if (user) redirect(target);
  return <AuthPanel mode="sign-in" next={target} />;
}
