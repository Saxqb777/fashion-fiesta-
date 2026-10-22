"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllRead, markRead } from "@/actions/notifications";
import { cn } from "cn";

type Notice = { id: string; title: string; body: string | null; href: string | null; at: string; read: boolean };

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** What happened, newest first. Opening one marks it read. */
export function NoticeList({ notices }: { notices: Notice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const unread = notices.filter((n) => !n.read).length;
  if (!notices.length) return null;
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-xl font-medium">What happened</h2>
        {unread ? <span className="tabular text-[13px] font-semibold text-brand">{unread} new</span> : null}
        {unread ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await markAllRead();
                router.refresh();
              })
            }
            className="ml-auto text-[13px] font-semibold text-ink-muted hover:text-ink"
          >
            Mark all read
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line bg-surface">
        {notices.map((n) => (
          <li key={n.id}>
            <Link href={n.href ?? "/today"} onClick={() => !n.read && markRead(n.id)} className="flex items-start gap-3 px-4 py-3 hover:bg-paper-deep/50 sm:px-5">
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={cn("text-[15px]", n.read ? "text-ink-muted" : "font-semibold")}>{n.title}</p>
                {n.body ? <p className="truncate text-[13px] text-ink-muted">{n.body}</p> : null}
              </div>
              <span className="tabular shrink-0 text-[12px] text-ink-muted">{fmt.format(new Date(n.at))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
