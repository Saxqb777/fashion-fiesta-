"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function FlashToast({ flash }: { flash: { m: string; t: number } | null }) {
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (!flash || shown.current === flash.t) return;
    shown.current = flash.t;
    toast.success(flash.m);
    document.cookie = "ff_flash=; Max-Age=0; path=/";
  }, [flash]);
  return null;
}
