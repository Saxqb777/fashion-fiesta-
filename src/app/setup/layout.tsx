import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { requireOwner } from "@/lib/session";
import { SetupProgress } from "./_components/setup-progress";

export const metadata: Metadata = { title: "Set up the shop" };

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <main className="min-h-screen bg-paper px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
          <Logo width={112} priority />
          <p className="text-[13px] font-semibold tracking-wide text-ink-muted uppercase">Setting up the shop</p>
        </div>
        <SetupProgress />
        <div className="mt-6 rounded-[14px] border border-line bg-surface p-5 sm:mt-8 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
