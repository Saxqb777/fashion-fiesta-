"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { text } from "@/lib/forms";

function safeRedirect(target: string) {
  return target.startsWith("/") && !target.startsWith("//") ? target : "/today";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirect(text(formData, "callbackUrl") || "/today");

  if (!email || !password) {
    return { message: "Enter your email and password." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "That email and password do not match." };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
