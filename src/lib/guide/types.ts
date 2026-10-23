/**
 * A guided tour: one short instruction at a time, pointed at the exact thing to tap.
 * Paths and selectors can carry {placeholders} that are filled from the links the server sends
 * (the ids of the practice customers, orders and tasks), so the same script works after every reset.
 */
export type GuideAdvance =
  /** She taps the lit up thing. */
  | "click"
  /** She types into it; Next lights up once there is something in it. */
  | "filled"
  /** Just read it, then Next. */
  | "next"
  /** The mission ticks on the server. Only for the last step of a mission. */
  | "mission"
  /** The page changes to one that matches. Used for buttons that save, so a red error keeps her on the step. */
  | { path: string }
  /** Something appears on the page, such as a dialog that opened. */
  | { see: string }
  /** Something that was there goes away, such as a dialog closing after a save. */
  | { gone: string }
  /** She taps this, while the lit up area is bigger (a whole form she fills, then its Save). */
  | { tap: string };

export type GuideStep = {
  /** The page the step happens on, as a pattern. Missing means any page. */
  at?: string;
  /** Where to take her when she is not on that page yet. */
  go?: string;
  /** CSS selector of what to light up. The first visible match wins. Missing means a bubble in the middle. */
  target?: string;
  /** What to say. **Bold** marks the word on the button. */
  say: string;
  /** Typed for her by Fill it for me. For a select, the option whose text contains it. "@name" reads that attribute of the field. */
  fill?: string;
  /** A sample file from the practice kit, offered as a Download button. */
  file?: string;
  advance: GuideAdvance;
};

export type GuideTour = { key: string; title: string; steps: GuideStep[] };

export type GuideLinks = Record<string, string>;

const SAFE = /\{(\w+)\}/g;

/** Puts the ids into a path or selector. A missing id leaves a pattern that matches nothing harmful. */
export function fillLinks(s: string, links: GuideLinks) {
  return s.replace(SAFE, (_, k: string) => links[k] ?? "__missing__");
}

/** A path pattern: "/orders/:id" style ids are written as [id]; anything else is literal, except a trailing *. */
export function pathMatches(pattern: string, pathname: string, links: GuideLinks) {
  const p = fillLinks(pattern, links);
  const re = new RegExp(
    `^${p
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|\\]/g, "\\$&").replace(/\[id\]/g, "[0-9a-f-]{36}"))
      .join(".*")}$`,
  );
  return re.test(pathname);
}
