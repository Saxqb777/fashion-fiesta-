import Image from "next/image";
import { cn } from "cn";

/** The real logo, white keyed out so it sits on paper. 202 x 114 source. */
export function Logo({ className, width = 128, priority }: { className?: string; width?: number; priority?: boolean }) {
  const height = Math.round((width * 114) / 202);
  return (
    <Image
      src="/brand/logo-transparent.png"
      alt="Fashion Fiesta"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto select-none", className)}
    />
  );
}
