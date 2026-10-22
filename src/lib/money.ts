/** Money is stored as integer fils. 100 fils = 1 AED. */
const formatter = new Intl.NumberFormat("en-AE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatFils(fils: number, options: { currency?: boolean } = {}) {
  const amount = formatter.format(fils / 100);
  return options.currency === false ? amount : `AED ${amount}`;
}

export function toFils(amount: number) {
  return Math.round(amount * 100);
}

export function formatNumber(value: string | number, padding: number) {
  return String(value).padStart(padding, "0");
}
