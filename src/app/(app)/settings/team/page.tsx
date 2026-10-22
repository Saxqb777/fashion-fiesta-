import { asc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { OperatorForm } from "@/components/forms/operator-form";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { SettingsSection } from "../settings-section";
import { TeamList } from "./team-list";

export default async function TeamSettings() {
  const me = await requireOwner();
  const settings = await getSettings();
  const people = await db.query.users.findMany({
    where: isNull(users.deletedAt),
    orderBy: [asc(users.role), asc(users.createdAt)],
    columns: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
  });
  const sorted = [...people].sort((a, b) => Number(b.isActive) - Number(a.isActive));

  return (
    <div className="flex flex-col gap-6">
      <TeamList people={sorted} meId={me.id} />
      <SettingsSection title="Embroidery operator" description="Runs the machine on a shared split. Not a login.">
        <OperatorForm settings={settings} />
      </SettingsSection>
    </div>
  );
}
