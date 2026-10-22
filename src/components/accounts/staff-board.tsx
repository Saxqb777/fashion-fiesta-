"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheetIcon, PencilIcon, PlusIcon, SearchIcon } from "lucide-react";
import { archiveStaff, importStaff, saveStaff } from "@/actions/accounts";
import { ArchiveButton } from "@/components/data/archive-button";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AccountStaff } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { SheetImport, type SheetColumn } from "./sheet-import";

type Branch = { id: string; name: string };

function StaffForm({ customerId, branches, person, onDone }: { customerId: string; branches: Branch[]; person?: AccountStaff; onDone: () => void }) {
  const [state, action] = useActionState(saveStaff, EMPTY_FORM_STATE);
  useFormFeedback(state, onDone);
  const e = state.errors ?? {};
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      {person ? <input type="hidden" name="id" value={person.id} /> : null}
      <FormMessage message={state.ok ? undefined : state.message} />
      <TextField name="name" label="Name" defaultValue={person?.name ?? ""} errors={e.name} autoFocus />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="branchId" label="Branch" defaultValue={person?.branchId ?? ""}>
          <option value="">No branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <TextField name="role" label="Role" defaultValue={person?.role ?? ""} placeholder="Therapist, Receptionist" />
      </div>
      <TextField name="sizes" label="Sizes" defaultValue={person?.sizes ?? ""} placeholder="Top M, Pant 32" hint="Free text. Shows when you split an order line." />
      <TextField name="notes" label="Notes" defaultValue={person?.notes ?? ""} />
      <div className="flex justify-end">
        <SubmitButton pendingText="Saving">{person ? "Save" : "Add person"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

const COLUMNS = (branches: Branch[]): SheetColumn[] => [
  { key: "name", title: "Name", hint: "Required.", synonyms: ["name", "staff", "staff name", "employee", "employee name", "person"], required: true },
  { key: "branch", title: "Branch", hint: `Optional. Must match a branch name${branches.length ? `, for example ${branches[0].name}` : ""}.`, synonyms: ["branch", "location", "site", "outlet", "store", "lounge"] },
  { key: "role", title: "Role", hint: "Optional.", synonyms: ["role", "position", "designation", "job", "title"] },
  { key: "sizes", title: "Sizes", hint: "Optional. Free text, for example Top M, Pant 32.", synonyms: ["sizes", "size", "uniform size", "measurements"] },
  { key: "notes", title: "Notes", hint: "Optional.", synonyms: ["notes", "note", "remarks", "comments"] },
];

export function StaffBoard({ customerId, branches, staff }: { customerId: string; branches: Branch[]; staff: AccountStaff[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AccountStaff | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? staff.filter((s) => [s.name, s.role, s.sizes].some((v) => v?.toLowerCase().includes(needle))) : staff;
  const groups = [...branches.map((b) => ({ id: b.id, name: b.name })), { id: null, name: "No branch" }]
    .map((b) => ({ ...b, rows: shown.filter((s) => (s.branchId ?? null) === b.id) }))
    .filter((g) => g.rows.length);
  const columns = COLUMNS(branches);
  const names = new Set(branches.map((b) => b.name.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {staff.length ? (
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role or size" className="pl-9" aria-label="Search staff" />
          </div>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            <FileSpreadsheetIcon />
            Import from Excel
          </Button>
          <Button variant="outline" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add person
          </Button>
        </div>
      </div>

      {staff.length ? (
        groups.map((g) => (
          <section key={g.id ?? "none"}>
            <h2 className="mb-2 flex items-baseline gap-2 text-xl font-medium">
              {g.name}
              <span className="tabular font-sans text-[13px] font-semibold text-ink-muted">{g.rows.length}</span>
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
              {g.rows.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">
                      {s.name}
                      {s.role ? <span className="ml-2 text-[13px] font-medium text-ink-muted">{s.role}</span> : null}
                    </p>
                    {s.sizes || s.notes ? <p className="text-[13px] text-ink-muted">{[s.sizes, s.notes].filter(Boolean).join(" · ")}</p> : null}
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                    <PencilIcon className="text-ink-muted" />
                  </Button>
                  <ArchiveButton action={archiveStaff} id={s.id} archived={false} noun="person" />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-line bg-surface p-5">
          <p className="text-[15px] text-ink-muted">Optional. Add their staff with sizes, and order lines can be split per person with the size filled in.</p>
          <div className="flex gap-2">
            <Button onClick={() => setEditing("new")}>
              <PlusIcon />
              Add the first person
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheetIcon />
              Import from Excel
            </Button>
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add a person" : `Edit ${editing?.name ?? ""}`}</DialogTitle>
            <DialogDescription>Sizes help when you split an order per person.</DialogDescription>
          </DialogHeader>
          {editing ? <StaffForm customerId={customerId} branches={branches} person={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      <SheetImport
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import staff"
        description="Their staff list with branch and sizes. The same name at the same branch updates that person."
        columns={columns}
        templateName="fashion-fiesta-staff.xlsx"
        check={(c) => (c.branch && !names.has(c.branch.trim().toLowerCase()) ? [`No branch called ${c.branch}.`] : [])}
        onImport={async (rows) => {
          const res = await importStaff(customerId, rows);
          if (res.ok) router.refresh();
          return res;
        }}
      />
    </div>
  );
}
