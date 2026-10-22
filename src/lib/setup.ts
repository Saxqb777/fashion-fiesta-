import { redirect } from "next/navigation";
import { SETUP_STEPS, type SetupStep } from "./defaults";
import { getSettings } from "./settings";

export async function requireSetupInProgress() {
  const settings = await getSettings();
  if (settings.setupComplete) redirect("/settings");
  return settings;
}

export function stepAfter(step: SetupStep): SetupStep | "done" {
  const i = SETUP_STEPS.indexOf(step);
  return SETUP_STEPS[i + 1] ?? "done";
}

export function stepIndex(step: string) {
  const i = SETUP_STEPS.indexOf(step as SetupStep);
  return i === -1 ? SETUP_STEPS.length : i;
}
