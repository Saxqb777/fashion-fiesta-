"use client";

import { useActionState, useState } from "react";
import { KeyRoundIcon, PencilIcon, PlusIcon } from "lucide-react";
import { setPersonActive } from "@/actions/settings";
import { PersonForm } from "@/components/forms/person-form";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { SubmitButton } from "@/components/form/submit-button";
import { RoleTag } from "@/components/people/role-tag";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { cn } from "cn";

type Person = { id: string; name: string; email: string; phone: string | null; role: "owner" | "tailor"; isActive: boolean };

export function TeamList({ people, meId }: { people: Person[]; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [resetting, setResetting] = useState<Person | null>(null);

  return (
    <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">People</h2>
          <p className="mt-1 text-sm text-ink-muted">Everyone who can sign in. Tailors see their tasks and the POS.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <PlusIcon />
          Add person
        </Button>
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        {people.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex flex-col gap-3 rounded-[14px] border border-line px-4 py-3 sm:flex-row sm:items-center",
              !p.isActive && "bg-paper-deep/50",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-[15px] font-semibold", !p.isActive && "text-ink-muted")}>
                {p.name}
                {p.id === meId ? <span className="ml-1.5 text-xs font-medium text-ink-muted">(you)</span> : null}
                {!p.isActive ? <span className="ml-1.5 text-xs font-medium text-ink-muted">· cannot sign in</span> : null}
              </p>
              <p className="truncate text-[13px] text-ink-muted">{[p.email, p.phone].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <RoleTag role={p.role} muted={!p.isActive} />
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                <PencilIcon className="text-ink-muted" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`New password for ${p.name}`} onClick={() => setResetting(p)}>
                <KeyRoundIcon className="text-ink-muted" />
              </Button>
              {p.id !== meId ? <ActiveToggle person={p} /> : null}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a person</DialogTitle>
            <DialogDescription>They can sign in on their phone as soon as you save.</DialogDescription>
          </DialogHeader>
          <PersonForm onSaved={() => setAdding(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
            <DialogDescription>Name, phone, email and role.</DialogDescription>
          </DialogHeader>
          {editing ? <PersonForm person={editing} onSaved={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetting)} onOpenChange={(open) => !open && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New password for {resetting?.name}</DialogTitle>
            <DialogDescription>Tell them the new password in person. The old one stops working at once.</DialogDescription>
          </DialogHeader>
          {resetting ? <ResetPasswordForm personId={resetting.id} onSaved={() => setResetting(null)} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ActiveToggle({ person }: { person: Person }) {
  const [state, action] = useActionState(setPersonActive, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={person.id} />
      <input type="hidden" name="active" value={person.isActive ? "false" : "true"} />
      <SubmitButton variant={person.isActive ? "ghost" : "outline"} size="sm" pendingText="Saving">
        {person.isActive ? "Deactivate" : "Reactivate"}
      </SubmitButton>
      {state.message && !state.ok ? <p className="sr-only">{state.message}</p> : null}
    </form>
  );
}
