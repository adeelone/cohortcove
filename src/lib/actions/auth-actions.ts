"use server";

import { clearSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/onboarding/login");
}
