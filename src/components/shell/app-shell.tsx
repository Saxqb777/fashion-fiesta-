import type { UserRole } from "@/db/schema";
import { cn } from "cn";
import { MissionsMount } from "@/components/practice/missions-panel";
import { ModeSwitch } from "@/components/practice/mode-switch";
import { PracticeRibbon } from "@/components/practice/ribbon";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { BottomNav, MobileTopBar } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { SignOutButton } from "./sign-out-button";

export function AppShell({
  user,
  practice,
  children,
}: {
  user: { name: string; role: UserRole; practiceOnly?: boolean };
  /** Practice mode: ribbon on every screen, the missions panel, and the sandbox database. */
  practice: { on: boolean; available: boolean };
  children: React.ReactNode;
}) {
  const canSwitch = user.role === "owner" && !user.practiceOnly && (practice.available || practice.on);
  return (
    <div
      className="min-h-screen bg-paper"
      data-practice={practice.on ? "1" : undefined}
      // The sidebar sticks below the Practice ribbon, never under it.
      style={practice.on ? ({ "--ribbon": "39px" } as React.CSSProperties) : undefined}
    >
      {practice.on ? <PracticeRibbon canLeave={canSwitch} /> : null}
      <div className="flex min-h-screen bg-paper">
        <Sidebar user={user} signOut={<SignOutButton />} slot={practice.on ? <div id="missions-slot" /> : null} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar aside={canSwitch ? <ModeSwitch practice={practice.on} /> : null} />
          {canSwitch ? (
            <div className="hidden h-14 items-center justify-end px-10 md:flex">
              <ModeSwitch practice={practice.on} />
            </div>
          ) : null}
          <main className={cn("mx-auto w-full max-w-5xl flex-1 px-4 pt-6 md:px-10 md:pt-2 md:pb-16", practice.on ? "pb-44" : "pb-28")}>{children}</main>
        </div>
        <BottomNav user={user} signOut={<SignOutButton />} />
      </div>
      {practice.on ? <MissionsMount owner={user.role === "owner"} /> : null}
      <RegisterServiceWorker />
    </div>
  );
}
