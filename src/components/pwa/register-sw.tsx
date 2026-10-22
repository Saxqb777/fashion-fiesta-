"use client";

import { useEffect } from "react";

/** Registers the service worker once per load. Push and the offline page need it. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
