import type { UserRole } from "@/db/schema";
import { BottomNav, MobileTopBar } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { SignOutButton } from "./sign-out-button";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";

export function AppShell({
  user,
  children,
}: {
  user: { name: string; role: UserRole };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar user={user} signOut={<SignOutButton />} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-16">
          {children}
        </main>
      </div>
      <BottomNav user={user} signOut={<SignOutButton />} />
      <RegisterServiceWorker />
    </div>
  );
}
