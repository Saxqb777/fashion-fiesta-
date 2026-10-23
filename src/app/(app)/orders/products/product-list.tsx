"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { setProductArchived } from "@/actions/catalog";
import { ArchiveButton } from "@/components/data/archive-button";
import { ArchivedTag, SoftTag } from "@/components/data/tags";
import { EmptyState } from "@/components/empty-state";
import { ProductForm } from "@/components/forms/product-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/db/schema";
import { PRODUCT_KIND_LABEL } from "@/lib/labels";
import { formatFils } from "@/lib/money";

type Row = Product & { categoryName: string | null };

export function ProductList({
  rows,
  categories,
  isEmpty,
  filteredText,
}: {
  rows: Row[];
  categories: { id: string; name: string }[];
  isEmpty: boolean;
  filteredText: string;
}) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const add = (
    <Button onClick={() => setEditing("new")} data-guide="add-product">
      <PlusIcon />
      {isEmpty ? "Add your first product" : "Add product"}
    </Button>
  );

  return (
    <>
      {isEmpty ? (
        <EmptyState
          title="No products yet"
          sentence="Products are what you sell: a school pinafore, a spa tunic, an abaya. Set a usual price once and orders fill it in."
          action={add}
        />
      ) : (
        <>
          <div className="mb-3 flex justify-end">{add}</div>
          {rows.length ? (
            <ul className="flex flex-col gap-2">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[16px] font-semibold">{p.name}</p>
                      {p.deletedAt ? <ArchivedTag /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                      {[p.categoryName, PRODUCT_KIND_LABEL[p.kind]].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    {p.priceFils ? (
                      <p className="tabular text-[15px] font-semibold">
                        {formatFils(p.priceFils)}
                        <span className="ml-1 text-[11px] font-medium text-ink-muted">before VAT</span>
                      </p>
                    ) : (
                      <SoftTag>No price</SoftTag>
                    )}
                    <div className="flex items-center">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                        <PencilIcon className="text-ink-muted" />
                      </Button>
                      <ArchiveButton action={setProductArchived} id={p.id} archived={Boolean(p.deletedAt)} noun="product" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState sentence={filteredText} action={add} />
          )}
        </>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add a product" : `Edit ${editing?.name ?? ""}`}</DialogTitle>
            <DialogDescription>The usual price fills in on new orders. You can always change it per order.</DialogDescription>
          </DialogHeader>
          {editing ? <ProductForm product={editing === "new" ? undefined : editing} categories={categories} onSaved={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
