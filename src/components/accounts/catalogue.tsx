"use client";

import { useActionState, useState } from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { archiveAccountItem, saveAccountItem } from "@/actions/accounts";
import { ArchiveButton } from "@/components/data/archive-button";
import { ActionForm } from "@/components/form/action-form";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountItem } from "@/db/schema";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { formatFils } from "@/lib/money";

function ItemForm({ customerId, item, onDone }: { customerId: string; item?: AccountItem; onDone?: () => void }) {
  const [state, action] = useActionState(saveAccountItem, EMPTY_FORM_STATE);
  useFormFeedback(state, onDone);
  const e = state.errors ?? {};
  return (
    <ActionForm key={item ? undefined : state.savedAt} action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="customerId" value={customerId} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" defaultValue={item?.name ?? ""} placeholder="Item, for example Lounge tunic, black" aria-label="Item" aria-invalid={e.name ? true : undefined} autoFocus={Boolean(item)} className="sm:flex-1" />
        <Input name="price" defaultValue={item ? (item.agreedPriceFils / 100).toFixed(2) : ""} inputMode="decimal" placeholder="Agreed price, AED" aria-label="Agreed price before VAT" aria-invalid={e.price ? true : undefined} className="tabular sm:w-44" />
        <div className="flex gap-2">
          <SubmitButton pendingText="Saving" variant={item ? "default" : "outline"}>
            {item ? <CheckIcon /> : null}
            {item ? "Save" : "Add"}
          </SubmitButton>
          {item ? (
            <Button type="button" variant="ghost" size="icon" aria-label="Cancel" onClick={onDone}>
              <XIcon />
            </Button>
          ) : null}
        </div>
      </div>
      {e.name || e.price ? <p className="text-[13px] font-medium text-brand-deep">{e.name?.[0] ?? e.price?.[0]}</p> : null}
    </ActionForm>
  );
}

/** Their uniform items at the price agreed with them. New orders prefill these prices. */
export function Catalogue({ customerId, items }: { customerId: string; items: AccountItem[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-medium">Agreed prices</h2>
        <p className="text-[14px] text-ink-muted">Prices before VAT. A new order for them fills these in, and you can still change any line.</p>
      </div>
      {items.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((it) =>
            editing === it.id ? (
              <li key={it.id} className="py-2.5">
                <ItemForm customerId={customerId} item={it} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <p className="min-w-0 flex-1 text-[15px] font-semibold">{it.name}</p>
                <p className="tabular font-display text-lg">{formatFils(it.agreedPriceFils)}</p>
                <Button size="icon-sm" variant="ghost" aria-label={`Change ${it.name}`} onClick={() => setEditing(it.id)}>
                  <PencilIcon className="text-ink-muted" />
                </Button>
                <ArchiveButton action={archiveAccountItem} id={it.id} archived={false} noun="item" />
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-[14px] text-ink-muted">Add their first uniform item and the price you agreed. It saves as a product too.</p>
      )}
      <ItemForm customerId={customerId} />
    </section>
  );
}
