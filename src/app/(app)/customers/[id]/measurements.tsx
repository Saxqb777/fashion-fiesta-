"use client";

import { useState } from "react";
import { PlusIcon, RulerIcon } from "lucide-react";
import { archiveMeasurementSet } from "@/actions/measurements";
import { ArchiveButton } from "@/components/data/archive-button";
import { Panel } from "@/components/data/detail";
import { MeasurementGrid } from "@/components/orders/bits";
import { MeasurementDialog, type MeasurementSet } from "@/components/orders/measurement-dialog";
import { Button } from "@/components/ui/button";

export function Measurements({ customerId, sets, fields }: { customerId: string; sets: (MeasurementSet & { notes: string | null })[]; fields: string[] }) {
  const [editing, setEditing] = useState<MeasurementSet | "new" | null>(null);
  return (
    <Panel
      title="Measurements"
      action={
        sets.length ? (
          <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
            <PlusIcon />
            New set
          </Button>
        ) : null
      }
    >
      {sets.length ? (
        <ul className="flex flex-col gap-4">
          {sets.map((s) => (
            <li key={s.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-[15px] font-semibold">
                  {s.label}
                  <span className="ml-2 text-[12px] font-medium text-ink-muted">
                    {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(s.createdAt))}
                  </span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                  <RulerIcon />
                  Re measure
                </Button>
                <ArchiveButton action={archiveMeasurementSet} id={s.id} archived={false} noun="measurement set" />
              </div>
              <MeasurementGrid values={s.values} />
              {s.notes ? <p className="text-[13px] text-ink-muted">{s.notes}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-muted">Measure once, reuse on every order. Keep a set for each person or size.</p>
          <Button variant="outline" onClick={() => setEditing("new")}>
            <RulerIcon />
            Take measurements
          </Button>
        </div>
      )}
      <MeasurementDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        customerId={customerId}
        fields={fields}
        editing={editing === "new" ? null : editing}
      />
    </Panel>
  );
}
