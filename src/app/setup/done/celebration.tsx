"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const BARS = ["bg-sky", "bg-sun", "bg-leaf", "bg-magenta"];

/** Under one second: four bars sweep in, then the check pops. */
export function Celebration({ shopName }: { shopName: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-8">
      <div className="relative flex size-24 items-center justify-center">
        <div className="absolute inset-x-0 bottom-0 flex h-2 gap-1 overflow-hidden rounded-full">
          {BARS.map((c, i) => (
            <motion.span
              key={c}
              className={`h-full flex-1 origin-left ${c}`}
              initial={reduce ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.18, delay: i * 0.09, ease: "easeOut" }}
            />
          ))}
        </div>
        <motion.div
          className="flex size-16 items-center justify-center rounded-full bg-brand text-white"
          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.42 }}
        >
          <CheckIcon className="size-8" strokeWidth={3} />
        </motion.div>
      </div>
      <motion.h1
        className="mt-8 text-[2rem] leading-tight font-medium sm:text-[2.5rem]"
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.55 }}
      >
        {shopName} is set up.
      </motion.h1>
      <motion.p
        className="mt-3 max-w-sm text-[15px] text-ink-muted"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      >
        Everything you entered lives in Settings and can be changed any time.
      </motion.p>
      <motion.div
        className="mt-8"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.8 }}
      >
        <Button size="lg" nativeButton={false} render={<Link href="/today" />}>
          Open Today
        </Button>
      </motion.div>
    </div>
  );
}
