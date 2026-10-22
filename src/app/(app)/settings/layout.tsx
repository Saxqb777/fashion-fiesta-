import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/session";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <>
      <PageHeader title="Settings" description="Everything the app knows about the shop. Change it here, never in code." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
