import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/auth";

export default async function HomePage() {
  const membership = await getCurrentMembership();
  redirect(membership ? "/feed" : "/onboarding/register");
}
