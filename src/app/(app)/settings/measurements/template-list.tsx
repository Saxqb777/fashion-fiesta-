"use client";

import { useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { archiveMeasurementTemplate, moveMeasurementTemplate, saveMeasurementTemplate } from "@/actions/measurements";
import { ArchiveButton } from "@/components/data/archive-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field = { id: string; name: string };
type Template = { id: string; name: string; fieldIds: string[] };

/** Name plus an ordered pick of fields. Arrows move a field up or down. */
function TemplateEditor({ template, fields, onDone }: { template?: Template; fields: Field[]; onDone: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [picked, setPicked] = useState<string[]>(template?.fieldIds ?? []);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const nameOf = new Map(fields.map((f) => [f.id, f.name]));
  const move = (i: number, d: -1 | 1) =>
    setPicked((p) => {
      const next = [...p];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const save = () =>
    start(async () => {
      const res = await saveMeasurementTemplate({ id: template?.id ?? null, name, fieldIds: picked });
      if (res.error) setError(res.error);
      else {
        toast.success(template ? `${name} saved.` : `${name} added.`);
        onDone();
      }
    });
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-ink/20 bg-paper-deep/40 p-4">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Garment, for example Pant" aria-label="Template name" autoFocus />
      <ol className="flex flex-col gap-1.5">
        {picked.map((id, i) => (
          <li key={id} className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-1.5">
            <span className="tabular w-5 text-[12px] font-semibold text-ink-muted">{i + 1}</span>
            <span className="flex-1 text-[15px] font-semibold">{nameOf.get(id)}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUpIcon />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === picked.length - 1} onClick={() => move(i, 1)}>
              <ArrowDownIcon />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${nameOf.get(id)}`} onClick={() => setPicked((p) => p.filter((x) => x !== id))}>
              <XIcon />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        {fields
          .filter((f) => !picked.includes(f.id))
          .map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPicked((p) => [...p, f.id])}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[14px] font-semibold hover:bg-paper-deep"
            >
              <PlusIcon className="size-3.5" />
              {f.name}
            </button>
          ))}
      </div>
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {template ? "Save template" : "Add template"}
        </Button>
      </div>
    </div>
  );
}

export function TemplateList({ templates, fields }: { templates: (Template & { fields: string[] })[]; fields: Field[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {templates.map((t, i) =>
          editing === t.id ? (
            <li key={t.id}>
              <TemplateEditor template={t} fields={fields} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={t.id} className="flex items-start gap-2 rounded-[14px] border border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{t.name}</p>
                <p className="text-[13px] text-ink-muted">{t.fields.join(", ")}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.name} up`} disabled={i === 0 || pending} onClick={() => start(() => moveMeasurementTemplate(t.id, "up"))}>
                <ArrowUpIcon className="text-ink-muted" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.name} down`} disabled={i === templates.length - 1 || pending} onClick={() => start(() => moveMeasurementTemplate(t.id, "down"))}>
                <ArrowDownIcon className="text-ink-muted" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t.id)}>
                <PencilIcon className="text-ink-muted" />
              </Button>
              <ArchiveButton action={archiveMeasurementTemplate} id={t.id} archived={false} noun="template" />
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <TemplateEditor fields={fields} onDone={() => setEditing(null)} />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setEditing("new")}>
          <PlusIcon />
          Add a garment template
        </Button>
      )}
    </div>
  );
}
