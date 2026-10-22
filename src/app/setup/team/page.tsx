import Link from "next/link";
import { and, asc, isNull } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { goToOpening } from "@/actions/settings";
import { db } from "@/db";
import { users } from "@/db/schema";
import { OperatorForm } from "@/components/forms/operator-form";
import { PersonForm } from "@/components/forms/person-form";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/session";
import { requireSetupInProgress } from "@/lib/setup";
import { StepFrame } from "../_components/step-frame";
import { PeopleList } from "./people-list";

export default async function TeamStep() {
  const me = await requireOwner();
  const settings = await requireSetupInProgress();
  const people = await db.query.users.findMany({
    where: and(isNull(users.deletedAt)),
    orderBy: [asc(users.role), asc(users.createdAt)],
  });
  const tailors = people.filter((p) => p.role === "tailor");

  return (
    <StepFrame
      step="team"
      title="Who works with you?"
      description="Tailors get a login for their phone. The embroidery operator gets a share of each job, not a login. You can add people later in Settings."
    >
      <section className="flex flex-col gap-4">
        <h2 className="font-sans text-base font-semibold">Tailors and owners</h2>
        <PeopleList people={people} meId={me.id} />
        <div className="rounded-[14px] border border-dashed border-line p-4 sm:p-5">
          <p className="mb-4 text-sm font-semibold">{tailors.length === 0 ? "Add your first tailor" : "Add another person"}</p>
          <PersonForm compact submitLabel="Add" />
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
        <h2 className="font-sans text-base font-semibold">Embroidery operator</h2>
        <OperatorForm settings={settings} />
      </section>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">
        <Button variant="ghost" nativeButton={false} render={<Link href="/setup/numbering" />}>
          <ArrowLeftIcon />
          Back
        </Button>
        <form action={goToOpening}>
          <SubmitButton size="lg" pendingText="Saving">
            Next
          </SubmitButton>
        </form>
      </div>
    </StepFrame>
  );
}
