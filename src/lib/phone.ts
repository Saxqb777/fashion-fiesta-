/** UAE numbers: 050 123 4567, +971 50..., 00971... all become 971501234567 for WhatsApp. Safe in the browser. */
export function whatsappNumber(phone: string | null | undefined) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `971${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("5")) d = `971${d}`;
  return d.length >= 10 ? d : null;
}
