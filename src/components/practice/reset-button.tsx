"use client";

import { useTransition } from "react";
import { Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { resetPractice } from "@/actions/practice";
import { Button } from "@/components/ui/button";

export function ResetPracticeButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Start Practice again from scratch? Everything done in Practice is wiped and the missions start over. The real shop is not touched.")) return;
        start(async () => {
          const res = await resetPractice();
          if (res.error) toast.error(res.error);
          else toast.success("Practice is fresh again.");
        });
      }}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
      {pending ? "Rebuilding Practice" : "Reset practice"}
    </Button>
  );
}
