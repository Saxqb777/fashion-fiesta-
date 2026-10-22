"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const fmt = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Big numbers count up on load, in under a second. */
export function CountUp({ fils, prefix = "AED " }: { fils: number; prefix?: string }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? fils : 0);
  const frame = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      setValue(Math.round(fils * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current!);
  }, [fils, reduce]);
  return (
    <span className="tabular">
      {prefix}
      {fmt.format((reduce ? fils : value) / 100)}
    </span>
  );
}
