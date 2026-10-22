"use client";

/** A full page load, so nothing from the other shop stays in the browser's memory. */
export function reloadInto(path: string) {
  window.location.href = new URL(path, window.location.origin).href;
}
