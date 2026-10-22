"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Logo } from "@/components/brand/logo";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import type { UserRole } from "@/db/schema";
import { navForRole } from "./nav";

export function Sidebar({
  user,
  signOut,
  slot,
}: {
  user: { name: string; role: UserRole };
  signOut: React.ReactNode;
  /** Practice puts the missions card here, above the user box. */
  slot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const groups = navForRole(user.role);
  return (
    <aside className="sticky top-[var(--ribbon,0px)] hidden h-[calc(100vh-var(--ribbon,0px))] w-[232px] shrink-0 flex-col overflow-y-auto border-r border-line bg-paper px-4 pt-6 pb-4 md:flex">
      <Link href="/today" className="mb-1 block px-2" aria-label="Today">
        <Logo width={120} priority />
      </Link>
      <SwooshStripe className="mx-2 mb-6 max-w-[56px]" height={2} />
      <nav className="flex flex-1 flex-col gap-5">
        {groups.map((group, gi) => (
          <ul key={gi} className="flex flex-col gap-0.5">
            {group.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold transition-colors",
                      active ? "bg-surface text-brand" : "text-ink hover:bg-paper-deep",
                    )}
                  >
                    <Icon className={cn("size-[18px]", active ? "text-brand" : "text-ink-muted")} />
                    <span className="flex-1">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </nav>
      {slot ? <div className="mt-6">{slot}</div> : null}
      <div className="mt-6 flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <p className="text-xs text-ink-muted capitalize">{user.role}</p>
        </div>
        {signOut}
      </div>
    </aside>
  );
}
