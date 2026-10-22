import type { LabelLayout } from "@/db/schema";

/** Label sheets the shop can print on. Client safe. */
export const LABEL_PRESETS: LabelLayout[] = [
  { name: "A4 sheet, 24 labels, 70 x 37 mm", pageWidthMm: 210, pageHeightMm: 297, cols: 3, rows: 8, widthMm: 70, heightMm: 37, topMm: 0.5, leftMm: 0, gapXMm: 0, gapYMm: 0 },
  { name: "A4 sheet, 21 labels, 70 x 42.4 mm", pageWidthMm: 210, pageHeightMm: 297, cols: 3, rows: 7, widthMm: 70, heightMm: 42.4, topMm: 0, leftMm: 0, gapXMm: 0, gapYMm: 0 },
  { name: "Thermal printer, 50 x 30 mm, one per label", pageWidthMm: 50, pageHeightMm: 30, cols: 1, rows: 1, widthMm: 50, heightMm: 30, topMm: 0, leftMm: 0, gapXMm: 0, gapYMm: 0 },
];
export const DEFAULT_LABEL_LAYOUT = LABEL_PRESETS[0];
