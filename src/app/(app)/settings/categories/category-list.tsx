"use client";

import { ActionForm } from "@/components/form/action-form";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { archiveCategory, saveCategory } from "@/actions/catalog";
import { setCategoryTemplate } from "@/actions/measurements";
import { ArchiveButton } from "@/components/data/archive-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMPTY_FORM_STATE } from "@/lib/forms";

function CategoryInput({ id, name, onDone }: { id?: string; name?: string; onDone?: () => void }) {
  const [state, action] = useActionState(saveCategory, EMPTY_FORM_STATE);
  useFormFeedback(state, onDone);
  const error = state.errors?.name?.[0];
  return (
    <ActionForm key={id ? undefined : state.savedAt} action={action} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {id ? <input type="hidden" name="id" value={id} /> : null}
        <Input name="name" defaultValue={name ?? ""} placeholder="New category name" aria-label="Category name" aria-invalid={error ? true : undefined} autoFocus={Boolean(id)} />
        <SubmitButton pendingText="Saving" variant={id ? "default" : "outline"}>
          {id ? <CheckIcon /> : null}
          {id ? "Save" : "Add"}
        </SubmitButton>
        {id ? (
          <Button type="button" variant="ghost" size="icon" aria-label="Cancel" onClick={onDone}>
            <XIcon />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
    </ActionForm>
  );
}

/** How a category is measured. Saves as soon as she picks. */
function TemplatePick({ categoryId, value, templates }: { categoryId: string; value: string | null; templates: { id: string; name: string }[] }) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, start] = useTransition();
  return (
    <select
      value={current}
      disabled={pending}
      aria-label="Measured as"
      onChange={(e) => {
        const next = e.target.value;
        const before = current;
        setCurrent(next);
        start(async () => {
          const res = await setCategoryTemplate(categoryId, next || null);
          if (res.error) {
            setCurrent(before);
            toast.error(res.error);
          } else toast.success(next ? `Measured as ${templates.find((t) => t.id === next)?.name}.` : "Shows all measurements.");
        });
      }}
      className="h-9 max-w-44 rounded-[10px] border border-line bg-surface px-2 text-[13px] font-medium text-ink"
    >
      <option value="">All measurements</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function CategoryList({ categories, templates = [] }: { categories: { id: string; name: string; templateId?: string | null }[]; templates?: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {categories.length ? (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c.id} className="rounded-[14px] border border-line px-4 py-2.5">
              {editing === c.id ? (
                <CategoryInput id={c.id} name={c.name} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-[15px] font-semibold">{c.name}</p>
                  {templates.length ? <TemplatePick categoryId={c.id} value={c.templateId ?? null} templates={templates} /> : null}
                  <Button variant="ghost" size="icon-sm" aria-label={`Rename ${c.name}`} onClick={() => setEditing(c.id)}>
                    <PencilIcon className="text-ink-muted" />
                  </Button>
                  <ArchiveButton action={archiveCategory} id={c.id} archived={false} noun="category" />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No categories yet. Add your first one below.</p>
      )}
      <CategoryInput />
    </div>
  );
}
