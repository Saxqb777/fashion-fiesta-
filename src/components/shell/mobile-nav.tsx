"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { cn } from "cn";
import { Logo } from "@/components/brand/logo";
import { SwooshStripe } from "@/components/brand/swoosh-stripe";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { UserRole } from "@/db/schema";
import { navForRole } from "./nav";

export function MobileTopBar() {
  return (
    <div className="flex h-14 items-center border-b border-line bg-paper px-4 md:hidden">
      <Link href="/today" aria-label="Today">
        <Logo width={92} priority />
      </Link>
    </div>
  );
}

export function BottomNav({
  user,
  signOut,
}: {
  user: { name: string; role: UserRole };
  signOut: React.ReactNode;
}) {
  const pathname = usePathname();
  const groups = navForRole(user.role);
  const [open, setOpen] = useState(false);
  const all = groups.flat();
  const primary = all.slice(0, 3);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const moreActive = all.slice(3).some((i) => isActive(i.href));

  return (
    <>
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden"
        aria-label="Main"
      >
        <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                    active ? "text-brand" : "text-ink-muted",
                  )}
                >
                  <Icon className="size-[22px]" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(
                "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold",
                moreActive ? "text-brand" : "text-ink-muted",
              )}
            >
              <MenuIcon className="size-[22px]" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="safe-bottom rounded-t-[18px] border-line bg-paper px-5 pt-3 pb-6"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <span aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
          <div className="mb-3">
            <p className="text-base font-semibold text-ink">{user.name}</p>
            <p className="text-sm text-ink-muted capitalize">{user.role}</p>
          </div>
          <SwooshStripe className="mb-1 max-w-[56px]" height={2} />
          <ul className="grid grid-cols-2 gap-2">
            {all.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex h-16 items-center gap-3 rounded-[14px] border border-line bg-surface px-4",
                      active ? "border-brand/30 text-brand" : "text-ink",
                    )}
                  >
                    <Icon className={cn("size-5 shrink-0", active ? "text-brand" : "text-ink-muted")} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[15px] font-semibold">{item.label}</span>
                      {item.phase > 0 ? (
                        <span className="text-[12px] font-medium text-ink-muted">Phase {item.phase}</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between rounded-[14px] border border-line bg-surface px-4 py-2">
            <span className="text-sm font-semibold text-ink-muted">Sign out of this phone</span>
            {signOut}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
