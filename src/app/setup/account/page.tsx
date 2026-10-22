import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AccountForm } from "@/components/forms/account-form";
import { requireOwner } from "@/lib/session";
import { requireSetupInProgress } from "@/lib/setup";
import { StepFrame } from "../_components/step-frame";

export default async function AccountStep() {
  const me = await requireOwner();
  await requireSetupInProgress();
  const user = await db.query.users.findFirst({ where: eq(users.id, me.id) });
  if (!user) notFound();
  return (
    <StepFrame
      step="account"
      title="First, your own login."
      description="You will use this every day. Set a password you will remember, or keep the starter one for now."
    >
      <AccountForm user={{ name: user.name, email: user.email, phone: user.phone }} />
    </StepFrame>
  );
}
