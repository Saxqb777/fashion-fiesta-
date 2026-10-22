"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, FileSpreadsheetIcon, Loader2Icon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { confirmBranches, importBranches } from "@/actions/accounts";
import { archiveBranch } from "@/actions/customers";
import { ArchiveButton } from "@/components/data/archive-button";
import { BranchForm } from "@/components/forms/branch-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerBranch } from "@/db/schema";
import { EMIRATES } from "@/lib/emirates";
import { telHref } from "@/lib/labels";
import { cn } from "cn";
import { SheetImport, type SheetColumn } from "./sheet-import";

const COLUMNS: SheetColumn[] = [
  { key: "name", title: "Branch", hint: "Required. The name they use, for example Al Wahda Mall.", synonyms: ["branch", "branch name", "name", "location", "site", "outlet", "store", "lounge"], required: true },
  { key: "emirate", title: "Emirate", hint: "Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah or Fujairah.", synonyms: ["emirate", "city", "region", "area"] },
  { key: "address", title: "Address", hint: "Where the driver goes.", synonyms: ["address", "delivery address", "location address"] },
  { key: "contactName", title: "Contact", hint: "Who receives deliveries.", synonyms: ["contact", "contact name", "contact person", "manager", "receiver"] },
  { key: "phone", title: "Phone", hint: "Their number.", synonyms: ["phone", "mobile", "tel", "telephone", "number", "contact number"] },
  { key: "deliveryInstructions", title: "Delivery notes", hint: "Receiving hours, who signs, parking.", synonyms: ["delivery notes", "notes", "delivery instructions", "instructions", "remarks"] },
];

export function BranchBoard({ customerId, customerName, branches, emirate }: { customerId: string; customerName: string; branches: CustomerBranch[]; emirate: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomerBranch | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = emirate ? branches.filter((b) => (b.emirate ?? "Not set") === emirate) : branches;
  const order = [...EMIRATES, "Not set"] as string[];
  const groups = order.map((e) => ({ emirate: e, rows: shown.filter((b) => (b.emirate ?? "Not set") === e) })).filter((g) => g.rows.length);
  const unverified = branches.filter((b) => !b.verified);

  const confirm = (ids: string[] | "all") =>
    start(async () => {
      setBusyId(ids === "all" ? "all" : ids[0]);
      const res = await confirmBranches(customerId, ids);
      setBusyId(null);
      if (res.error) return void toast.error(res.error);
      toast.success(ids === "all" ? `${res.count} branches confirmed.` : "Branch confirmed.");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Link href={`/customers/${customerId}?tab=branches`} scroll={false} className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", !emirate ? "border-ink bg-ink text-paper" : "border-line bg-surface")}>
            All {branches.length}
          </Link>
          {order
            .map((e) => ({ e, n: branches.filter((b) => (b.emirate ?? "Not set") === e).length }))
            .filter((x) => x.n)
            .map(({ e, n }) => (
              <Link
                key={e}
                href={`/customers/${customerId}?tab=branches&emirate=${encodeURIComponent(e)}`}
                scroll={false}
                className={cn("rounded-full border px-3.5 py-1.5 text-[13px] font-semibold", emirate === e ? "border-ink bg-ink text-paper" : "border-line bg-surface")}
              >
                {e} <span className="tabular opacity-70">{n}</span>
              </Link>
            ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            <FileSpreadsheetIcon />
            Import from Excel
          </Button>
          <Button variant="outline" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add branch
          </Button>
        </div>
      </div>

      {unverified.length ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-dashed border-brand/50 bg-brand-soft/40 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-[15px]">
            <span className="font-semibold">
              {unverified.length} of {branches.length} branches still to check.
            </span>{" "}
            They came from {customerName}&apos;s website. Confirm each one, or edit it, once their team agrees it is right.
          </p>
          <Button variant="outline" disabled={pending} onClick={() => confirm("all")}>
            {busyId === "all" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            Confirm all {unverified.length}
          </Button>
        </div>
      ) : null}

      {groups.length ? (
        groups.map((g) => (
          <section key={g.emirate}>
            <h2 className="mb-2 flex items-baseline gap-2 text-xl font-medium">
              {g.emirate}
              <span className="tabular font-sans text-[13px] font-semibold text-ink-muted">{g.rows.length}</span>
            </h2>
            <ul className="grid gap-2 md:grid-cols-2">
              {g.rows.map((b) => (
                <li key={b.id} className={cn("flex flex-col gap-2 rounded-[14px] border bg-surface px-4 py-3", b.verified ? "border-line" : "border-dashed border-ink-muted/40")}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold">{b.name}</p>
                      {b.address ? <p className="mt-0.5 text-[13px] text-ink-muted">{b.address}</p> : null}
                      <p className="mt-0.5 text-[13px] text-ink-muted">
                        {b.contactName}
                        {b.phone ? (
                          <>
                            {b.contactName ? " · " : ""}
                            <a href={telHref(b.phone)} className="tabular font-semibold text-ink hover:underline">
                              {b.phone}
                            </a>
                          </>
                        ) : null}
                      </p>
                      {b.deliveryInstructions ? <p className="mt-1 text-[13px]">{b.deliveryInstructions}</p> : null}
                    </div>
                    {b.verified ? null : <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-muted">Unverified</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {b.verified ? null : (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm([b.id])}>
                        {busyId === b.id ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                        Confirm
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
                      <PencilIcon />
                      Edit
                    </Button>
                    <span className="ml-auto">
                      <ArchiveButton action={archiveBranch} id={b.id} archived={false} noun="branch" />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-line bg-surface p-5">
          <p className="text-[15px] text-ink-muted">Add each branch once, with its emirate. Orders, deliveries and the report all work per branch.</p>
          <div className="flex gap-2">
            <Button onClick={() => setEditing("new")}>
              <PlusIcon />
              Add the first branch
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
            <DialogTitle>{editing === "new" ? "Add a branch" : `Edit ${editing?.name ?? ""}`}</DialogTitle>
            <DialogDescription>Saving a branch also confirms it.</DialogDescription>
          </DialogHeader>
          {editing ? <BranchForm customerId={customerId} branch={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>

      <SheetImport
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import branches"
        description="Upload their branch list, or paste it. A branch with the same name updates the one already here."
        columns={COLUMNS}
        templateName="fashion-fiesta-branches.xlsx"
        onImport={async (rows) => {
          const res = await importBranches(customerId, rows);
          if (res.ok) router.refresh();
          return res;
        }}
      />
    </div>
  );
}
