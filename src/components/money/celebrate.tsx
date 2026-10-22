"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";

const COLOURS = ["bg-sky", "bg-sun", "bg-leaf", "bg-magenta", "bg-brand"];

/**
 * Payment received: a small burst. Invoice fully paid: a wider burst of the swoosh colours.
 * Task approved: a small burst in red. Under a second, then gone.
 * Triggered by ?celebrate=payment, ?celebrate=paid or ?celebrate=approved.
 */
export function Celebrate() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [kind, setKind] = useState<"payment" | "paid" | "approved" | null>(null);

  useEffect(() => {
    const k = params.get("celebrate");
    if (k !== "payment" && k !== "paid" && k !== "approved") return;
    const on = setTimeout(() => setKind(k), 0);
    const off = setTimeout(() => setKind(null), 950);
    if (k !== "approved") toast.success(k === "paid" ? "Paid in full." : "Payment received.");
    router.replace(pathname, { scroll: false });
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [params, router, pathname]);

  const count = kind === "paid" ? 14 : 6;
  return (
    <AnimatePresence>
      {kind ? (
        <motion.div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {Array.from({ length: count }).map((_, i) => {
            const angle = (i / count) * Math.PI * 2;
            const r = kind === "paid" ? 150 : 80;
            return (
              <motion.span
                key={i}
                className={`absolute rounded-full ${COLOURS[i % COLOURS.length]} ${kind === "paid" ? "size-3.5" : "size-2.5"}`}
                initial={reduce ? false : { x: 0, y: 0, scale: 0.3, opacity: 1 }}
                animate={{ x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.7, scale: 1, opacity: 0 }}
                transition={{ duration: 0.75, ease: "easeOut" }}
              />
            );
          })}
          <motion.span
            className={`flex items-center justify-center rounded-full text-white ${kind === "paid" ? "size-20 bg-leaf" : kind === "approved" ? "size-16 bg-brand" : "size-14 bg-ink"}`}
            initial={reduce ? false : { scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <CheckIcon className={kind === "paid" ? "size-10" : "size-7"} strokeWidth={3} />
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
