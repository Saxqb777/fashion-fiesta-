import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { stepIndex } from "@/lib/setup";
import { SETUP_STEPS } from "@/lib/defaults";

export default async function SetupIndex() {
  const settings = await getSettings();
  if (settings.setupComplete) redirect("/settings");
  const step = SETUP_STEPS[Math.min(stepIndex(settings.setupStep), SETUP_STEPS.length - 1)];
  redirect(`/setup/${step}`);
}
