import Link from "next/link";
import { MapPinIcon, MessageCircleQuestionIcon } from "lucide-react";
import { DueChip, Progress, TaskStatusTag } from "@/components/orders/bits";
import type { TaskStatus } from "@/db/schema";

export type TaskCardData = {
  id: string;
  status: TaskStatus;
  qty: number;
  qtyDone: number;
  dueDate: string | null;
  openQuestion: boolean;
  orderNumber: string | null;
  customerName: string;
  description: string;
  photoUrl: string | null;
  fabricShelf: string | null;
  assigneeName?: string;
};

/** Tailor tasks are photo cards. The photo is the latest work photo, or the fabric. */
export function TaskCard({ t, showAssignee }: { t: TaskCardData; showAssignee?: boolean }) {
  return (
    <li>
      <Link href={`/workshop/tasks/${t.id}`} className="group flex h-full flex-col overflow-hidden rounded-[14px] border border-line bg-surface transition-colors hover:border-ink/25">
        <div className={t.photoUrl ? "relative aspect-[16/10] bg-paper-deep" : "relative h-24 bg-paper-deep"}>
          {t.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : null}
          <div className="absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-1.5">
            <DueChip date={t.dueDate} done={t.status === "approved"} className="bg-surface" />
            {t.openQuestion ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-magenta px-2.5 text-[11px] font-bold text-white">
                <MessageCircleQuestionIcon className="size-3.5" />
                Question
              </span>
            ) : null}
          </div>
          {t.fabricShelf ? (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-[12px] font-semibold">
              <MapPinIcon className="size-3.5 text-brand" />
              {t.fabricShelf}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[17px] leading-snug font-semibold">{t.description}</p>
            <TaskStatusTag status={t.status} />
          </div>
          <p className="truncate text-[13px] text-ink-muted">
            {[t.customerName, t.orderNumber, showAssignee ? t.assigneeName : null].filter(Boolean).join(" · ")}
          </p>
          <Progress done={t.qtyDone} approved={t.status === "approved" ? t.qty : 0} total={t.qty} className="mt-auto pt-1" />
        </div>
      </Link>
    </li>
  );
}
