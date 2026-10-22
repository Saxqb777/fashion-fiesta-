import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/today");
  return user;
}
