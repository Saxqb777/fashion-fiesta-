import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { AppShell } from "@/components/shell/app-shell";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();

  if (!settings.setupComplete) {
    if (user.role === "owner") redirect("/setup");
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-paper px-6 text-center">
        <Logo width={120} />
        <h1 className="text-2xl font-medium">The shop is still being set up.</h1>
        <p className="max-w-xs text-ink-muted">Ask the owner to finish the setup, then sign in again.</p>
        <SignOutButton />
      </main>
    );
  }

  return (
    <AppShell user={{ name: user.name ?? "", role: user.role }}>{children}</AppShell>
  );
}
