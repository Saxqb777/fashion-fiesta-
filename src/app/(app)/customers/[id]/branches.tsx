"use client";

import { useState } from "react";
import { MapPinIcon, PencilIcon, PlusIcon } from "lucide-react";
import { archiveBranch } from "@/actions/customers";
import { ArchiveButton } from "@/components/data/archive-button";
import { Panel } from "@/components/data/detail";
import { BranchForm } from "@/components/forms/branch-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerBranch } from "@/db/schema";
import { telHref } from "@/lib/labels";

export function Branches({ customerId, branches }: { customerId: string; branches: CustomerBranch[] }) {
  const [editing, setEditing] = useState<CustomerBranch | "new" | null>(null);
  return (
    <Panel
      title="Branches"
      action={
        branches.length ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add branch
          </Button>
        ) : null
      }
    >
      {branches.length ? (
        <ul className="flex flex-col gap-2">
          {branches.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 rounded-[14px] border border-line px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <MapPinIcon className="size-4 text-ink-muted" />
                  {b.name}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {[b.contactName, b.address].filter(Boolean).join(" · ")}
                  {b.phone ? (
                    <>
                      {b.contactName || b.address ? " · " : ""}
                      <a href={telHref(b.phone)} className="font-semibold text-ink underline-offset-2 hover:underline">
                        {b.phone}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(b)}>
                  <PencilIcon />
                  Edit
                </Button>
                <ArchiveButton action={archiveBranch} id={b.id} archived={false} noun="branch" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">Schools and chains order for several sites. Add each site so orders and deliveries go to the right place.</p>
          <Button variant="outline" onClick={() => setEditing("new")}>
            <PlusIcon />
            Add the first branch
          </Button>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add a branch" : `Edit ${editing?.name ?? ""}`}</DialogTitle>
            <DialogDescription>Each branch can have its own contact and delivery address.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <BranchForm customerId={customerId} branch={editing === "new" ? undefined : editing} onSaved={() => setEditing(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
