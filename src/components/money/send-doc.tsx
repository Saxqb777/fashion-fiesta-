"use client";

import { useState } from "react";
import { FileTextIcon, Loader2Icon, MessageCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MailProps } from "@/lib/doc-links";
import { EmailDoc } from "./email-doc";

/**
 * PDF and Send on WhatsApp. On a phone the PDF itself is shared into WhatsApp.
 * On a laptop WhatsApp opens with a message and a link the customer can open without logging in.
 * Owners also get Send by email, with the PDF attached.
 */
export function SendDoc({
  pdfUrl,
  shareUrl,
  whatsapp,
  filename,
  message,
  mail,
  size = "sm",
}: {
  pdfUrl: string;
  shareUrl: string;
  whatsapp: string | null;
  filename: string;
  message: string;
  mail?: MailProps | null;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState(false);
  const fallback = () => {
    const text = encodeURIComponent(`${message} ${shareUrl}`);
    window.open(whatsapp ? `https://wa.me/${whatsapp}?text=${text}` : `https://wa.me/?text=${text}`, "_blank", "noopener");
  };
  const send = async () => {
    setBusy(true);
    try {
      const isPhone = typeof navigator !== "undefined" && /android|iphone|ipad/i.test(navigator.userAgent);
      if (isPhone && "canShare" in navigator) {
        const blob = await (await fetch(pdfUrl)).blob();
        const file = new File([blob], filename, { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: message });
          return;
        }
      }
      fallback();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) fallback();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size={size} nativeButton={false} render={<a href={pdfUrl} target="_blank" rel="noreferrer" />}>
        <FileTextIcon />
        PDF
      </Button>
      <Button variant="outline" size={size} onClick={send} disabled={busy} className="border-[#25D366]/40 text-[#128C4B] hover:bg-[#25D366]/10">
        {busy ? <Loader2Icon className="animate-spin" /> : <MessageCircleIcon />}
        Send on WhatsApp
      </Button>
      {mail ? <EmailDoc mail={mail} size={size} /> : null}
    </div>
  );
}
