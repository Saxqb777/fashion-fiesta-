import type { Box, VatPack } from "./vat";

/**
 * Filing on EmaraTax, step by step, with the shop's own figure printed beside each box.
 * Screen names on EmaraTax can change slightly over time; the box numbers do not.
 */
export type GuideStep = { title: string; text: string; boxes?: Box[]; check?: Box[] };

export function emarataxGuide(pack: VatPack, period: { label: string }, due: string): GuideStep[] {
  const pick = (...keys: string[]) => pack.boxes.filter((b) => keys.includes(b.box));
  const pay = pack.totals.due;
  return [
    { title: "Sign in", text: "Go to tax.gov.ae and sign in to EmaraTax with UAE Pass or the shop's email and password." },
    { title: "Open the return", text: `Open the shop's taxable person tile, then VAT, then VAT Returns. Find ${period.label} and tap File. It is due by ${due}.` },
    {
      title: "VAT on sales and all other outputs",
      text: "Type these figures. Every sale goes in 1a, Abu Dhabi, where the shop is. Leave the other emirates and boxes 2 to 7 at zero.",
      boxes: pick("1a", "1b", "1c", "1d", "1e", "1f", "1g", "2", "3", "4", "5", "6", "7"),
      check: pick("8"),
    },
    {
      title: "VAT on expenses and all other inputs",
      text: "Type the purchases you can claim. Box 10 stays at zero.",
      boxes: pick("9", "10"),
      check: pick("11"),
    },
    { title: "Net VAT due", text: "EmaraTax works these out by itself. Check they match.", check: pick("12", "13", "14") },
    { title: "The last questions", text: "If asked whether you used the profit margin scheme, answer No, unless your accountant tells you otherwise." },
    { title: "Declare and submit", text: "Tick the declaration and tap Submit. Write down the reference number EmaraTax shows, then come back here and mark the quarter as filed with that reference." },
    pay >= 0
      ? { title: "Pay", text: `Pay the VAT due by ${due}. On EmaraTax open My Payments, choose this return and pay by card or bank transfer to the GIBAN shown.` }
      : { title: "Refund", text: "This quarter ends with VAT to get back. Ask your accountant whether to claim the refund on EmaraTax or keep it against the next return." },
  ];
}
