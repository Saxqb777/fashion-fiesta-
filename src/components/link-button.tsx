import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LinkButton({
  href,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "render" | "nativeButton"> & { href: string }) {
  return (
    <Button nativeButton={false} render={<Link href={href} />} {...props}>
      {children}
    </Button>
  );
}
