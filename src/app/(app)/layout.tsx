import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { AppShell } from "@/components/shell/app-shell";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { eq } from "drizzle-orm";
import { liveDb, practiceAvailable } from "@/db";
import { users } from "@/db/schema";
import { setupSteps } from "@/lib/guide/setup";
import { guideLinks, isPractice } from "@/lib/practice";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { FlashToast } from "@/components/flash-toast";
import { readFlash } from "@/lib/flash";

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

  const flash = await readFlash();
  const practice = isPractice();
  const realOwner = user.role === "owner" && !user.practiceOnly;
  // The guide: missions in Practice, the setup steps and the getting started sheet in Live.
  const [links, pending, me] = await Promise.all([
    practice ? guideLinks(user.id!) : {},
    !practice && realOwner ? setupSteps().then((s) => s.filter((x) => !x.done).map((x) => x.key)) : [],
    !practice && realOwner ? liveDb.query.users.findFirst({ where: eq(users.id, user.id!), columns: { guideSeenAt: true } }) : undefined,
  ]);
  const guide = { mode: practice ? ("practice" as const) : realOwner ? ("live" as const) : ("off" as const), links, pendingSetup: pending, welcome: Boolean(me && !me.guideSeenAt) };
  return (
    <AppShell user={{ name: user.name ?? "", role: user.role, practiceOnly: user.practiceOnly }} practice={{ on: practice, available: practiceAvailable() }} guide={guide}>
      <FlashToast flash={flash} />
      {children}
    </AppShell>
  );
}
