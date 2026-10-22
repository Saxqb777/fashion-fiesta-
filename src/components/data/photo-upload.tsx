"use client";

import { useRef, useState } from "react";
import { CameraIcon, Loader2Icon, XIcon } from "lucide-react";
import { cn } from "cn";

/** Shrinks a photo on the phone before upload. Cheap phones take 4000px photos. */
async function shrink(file: File, maxSide = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PhotoUpload({
  name,
  folder,
  defaultUrl,
  label,
  emptyText = "Take or choose a photo",
  onChange,
}: {
  name: string;
  folder: string;
  defaultUrl?: string | null;
  label?: string;
  emptyText?: string;
  onChange?: (url: string) => void;
}) {
  const [url, setUrlState] = useState(defaultUrl ?? "");
  const setUrl = (next: string) => {
    setUrlState(next);
    onChange?.(next);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("folder", folder);
      body.set("file", new File([await shrink(file)], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed.");
      setUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label ? <span className="text-sm font-semibold text-ink">{label}</span> : null}
      <input type="hidden" name={name} value={url} />
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      {url ? (
        <div className="relative w-full max-w-sm overflow-hidden rounded-[14px] border border-line bg-paper-deep">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-ink/60 to-transparent p-3">
            <button type="button" onClick={() => input.current?.click()} className="h-10 flex-1 rounded-[10px] bg-surface text-sm font-semibold text-ink">
              {busy ? "Uploading" : "Retake"}
            </button>
            <button type="button" aria-label="Remove photo" onClick={() => setUrl("")} className="flex size-10 items-center justify-center rounded-[10px] bg-surface text-ink">
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className={cn(
            "flex aspect-[4/3] w-full max-w-sm flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-line bg-paper text-ink-muted transition-colors hover:border-brand/40 hover:text-ink",
            busy && "cursor-wait",
          )}
        >
          {busy ? <Loader2Icon className="size-7 animate-spin" /> : <CameraIcon className="size-8" />}
          <span className="text-[15px] font-semibold">{busy ? "Uploading" : emptyText}</span>
        </button>
      )}
      {error ? <p className="text-[13px] font-medium text-brand-deep">{error}</p> : null}
    </div>
  );
}
