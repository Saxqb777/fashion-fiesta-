"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { saveStamp } from "@/actions/settings";
import { Button } from "@/components/ui/button";

/** The shop stamp, kept as uploaded (PNG keeps its transparent background). */
export function StampSettings({ url: startUrl, on: startOn }: { url: string | null; on: boolean }) {
  const [url, setUrl] = useState(startUrl ?? "");
  const [on, setOn] = useState(startOn);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const save = (next: { url: string; on: boolean }, message: string) =>
    start(async () => {
      const res = await saveStamp(next);
      if (res.error) return void toast.error(res.error);
      setUrl(next.url);
      setOn(next.on && Boolean(next.url));
      toast.success(message);
    });

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set("folder", "brand");
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed.");
      save({ url: json.url, on: true }, "Stamp saved. It now prints on Tax Invoice, Delivery Note and Credit Note.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-36 w-full max-w-56 items-center justify-center rounded-[14px] border border-dashed border-line bg-surface p-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Shop stamp" className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-center text-[13px] text-ink-muted">No stamp yet</p>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={busy || pending} onClick={() => input.current?.click()} className="self-start">
          {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
          {url ? "Upload a new stamp" : "Upload the stamp"}
        </Button>
        <p className="max-w-sm text-[13px] text-ink-muted">A PNG with a transparent background looks best. Scan or photograph the stamp on white paper.</p>
        <label className="flex items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={on}
            disabled={!url || pending}
            onChange={(e) => save({ url, on: e.target.checked }, e.target.checked ? "The stamp prints on documents." : "The stamp no longer prints.")}
            className="size-5 accent-[#D7182A]"
          />
          Print it in the signatory box on Tax Invoice, Delivery Note and Credit Note
        </label>
        {url ? (
          <button type="button" disabled={pending} onClick={() => save({ url: "", on: false }, "Stamp removed.")} className="self-start text-[13px] font-semibold text-ink-muted hover:text-ink">
            Remove the stamp
          </button>
        ) : null}
      </div>
    </div>
  );
}
