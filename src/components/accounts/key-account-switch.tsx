"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { setKeyAccount } from "@/actions/accounts";
import { Button } from "@/components/ui/button";

export function KeyAccountSwitch({ customerId, on, name }: { customerId: string; on: boolean; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={on ? "ghost" : "outline"}
      size={on ? "sm" : "default"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setKeyAccount(customerId, !on);
          if (res.error) return void toast.error(res.error);
          toast.success(on ? `${name} is a regular customer page again. Nothing was deleted.` : `${name} is now a key account.`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {on ? "Turn off key account" : "Make key account"}
    </Button>
  );
}
