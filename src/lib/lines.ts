/** Line maths. Prices are before VAT, in fils. */
export function lineAmounts(qty: number, unitPriceFils: number, vatRateBp: number) {
  const netFils = qty * unitPriceFils;
  const vatFils = Math.round((netFils * vatRateBp) / 10000);
  return { netFils, vatFils, totalFils: netFils + vatFils };
}

export function documentTotals(lines: { netFils: number; vatFils: number }[]) {
  const subtotalFils = lines.reduce((s, l) => s + l.netFils, 0);
  const vatFils = lines.reduce((s, l) => s + l.vatFils, 0);
  return { subtotalFils, vatFils, totalFils: subtotalFils + vatFils };
}
