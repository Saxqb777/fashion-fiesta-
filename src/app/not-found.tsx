import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 text-center">
      <Logo width={120} />
      <h1 className="text-3xl font-medium">That page is not here.</h1>
      <p className="max-w-sm text-ink-muted">The link may be old, or the section has not been built yet.</p>
      <Button nativeButton={false} render={<Link href="/today" />}>
        Go to Today
      </Button>
    </main>
  );
}
