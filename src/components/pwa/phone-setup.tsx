"use client";

import { useEffect, useState, useTransition } from "react";
import { BellIcon, DownloadIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { removePushSubscription, savePushSubscription } from "@/actions/notifications";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const DISMISS_KEY = "ff-phone-setup-dismissed";

/**
 * One small card: install the app, and allow notices on this phone.
 * Hides itself once both are done, or when dismissed.
 */
export function PhoneSetup() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [pushState, setPushState] = useState<"unsupported" | "default" | "granted" | "denied" | "on">("unsupported");
  const [dismissed, setDismissed] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        setDismissed(false);
      }
      setStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
      if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setPushState(sub && Notification.permission === "granted" ? "on" : (Notification.permission as "default" | "granted" | "denied"));
      }
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  const turnOn = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setPushState(permission as "denied" | "default");
          return void toast.error("Notifications are blocked. Allow them for this site in the browser settings.");
        }
        const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) });
        const res = await savePushSubscription(sub.toJSON(), navigator.userAgent);
        if (res.error) return void toast.error(res.error);
        setPushState("on");
        toast.success("Notifications are on for this phone.");
      } catch {
        toast.error("This browser could not turn notifications on.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushState("default");
      toast.success("Notifications are off for this phone.");
    });

  const canInstall = !standalone && (install || ios);
  // iPhones only allow push from the app added to the home screen.
  const canPush = pushState === "default" || pushState === "granted";
  if (pushState === "on" && !canInstall) {
    return (
      <button type="button" onClick={turnOff} disabled={pending} className="text-[13px] font-semibold text-ink-muted hover:text-ink">
        Notifications are on for this phone. Turn off
      </button>
    );
  }
  if (dismissed || (!canInstall && !canPush)) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-[15px]">
        <span className="font-semibold">Set up this phone. </span>
        <span className="text-ink-muted">
          {canInstall && ios && !install ? "Tap Share, then Add to Home Screen, so it opens like an app and can show notifications." : "Open it like an app, and hear about new work and payments."}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {install && !standalone ? (
          <Button
            variant="outline"
            className="h-12"
            onClick={async () => {
              await install.prompt();
              await install.userChoice;
              setInstall(null);
            }}
          >
            <DownloadIcon />
            Install the app
          </Button>
        ) : null}
        {canPush && !(ios && !standalone) ? (
          <Button className="h-12" onClick={turnOn} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <BellIcon />}
            Turn on notifications
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Not now"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
          }}
        >
          <XIcon />
        </Button>
      </div>
    </section>
  );
}
