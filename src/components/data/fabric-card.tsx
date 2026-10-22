import Link from "next/link";
import { MapPinIcon } from "lucide-react";
import type { Fabric } from "@/db/schema";
import { formatFils } from "@/lib/money";
import { ArchivedTag } from "./tags";

/** The roll is the hero: photo first, then name, colour and where it sits. */
export function FabricCard({ f, supplierName, stockCenti }: { f: Fabric; supplierName?: string | null; stockCenti?: number }) {
  const low = stockCenti !== undefined && f.lowStockCenti !== null && stockCenti <= f.lowStockCenti;
  return (
    <li>
      <Link href={`/purchases/fabrics/${f.id}`} className="group block overflow-hidden rounded-[14px] border border-line bg-surface transition-colors hover:border-ink/20">
        <div className="relative aspect-[4/3] bg-paper-deep">
          {f.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.photoUrl} alt={f.name} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex size-full items-end p-3">
              <span className="font-display text-3xl leading-none text-ink-muted/30">{f.name}</span>
            </div>
          )}
          {f.shelfLocation ? (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-[12px] font-semibold text-ink">
              <MapPinIcon className="size-3.5 text-brand" />
              {f.shelfLocation}
            </span>
          ) : null}
          {stockCenti !== undefined ? (
            <span
              className={
                low
                  ? "tabular absolute right-2 bottom-2 rounded-full bg-brand px-2.5 py-1 text-[12px] font-bold text-white"
                  : "tabular absolute right-2 bottom-2 rounded-full bg-surface/95 px-2.5 py-1 text-[12px] font-semibold text-ink"
              }
            >
              {(stockCenti / 100).toFixed(2)} m{low ? ", low" : ""}
            </span>
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-2 p-3.5">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{f.name}</p>
            <p className="truncate text-[13px] text-ink-muted">{[f.colour, f.code, supplierName].filter(Boolean).join(" · ") || "No colour or code yet"}</p>
          </div>
          {f.deletedAt ? (
            <ArchivedTag />
          ) : f.priceFils ? (
            <p className="tabular shrink-0 text-right text-[13px] font-semibold">
              {formatFils(f.priceFils, { currency: false })}
              <span className="block text-[11px] font-medium text-ink-muted">per m</span>
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
