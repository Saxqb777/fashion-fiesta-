import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Celebration } from "./celebration";

export default async function DonePage() {
  await requireOwner();
  const settings = await getSettings();
  if (!settings.setupComplete) redirect("/setup");
  return <Celebration shopName={settings.tradeName} />;
}
