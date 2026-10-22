import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { and, eq, inArray } from "drizzle-orm";
import { practiceDb } from "@/db";
import { customerBranches, customers } from "@/db/schema";
import { addDaysISO, todayISO } from "@/lib/dates";
import { SAMPLE_BRANCHES, SAMPLE_PO_NUMBER } from "./seed";

/* The customer's own document, so it deliberately looks like theirs and not ours: Helvetica, their colours. */
const pink = "#C2185B";
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#222" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2pt solid ${pink}`, paddingBottom: 12 },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: pink, letterSpacing: 1 },
  small: { fontSize: 8.5, color: "#555", marginTop: 2 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  row: { flexDirection: "row" },
  box: { flex: 1, border: "0.7pt solid #ccc", padding: 8, marginTop: 14 },
  label: { fontSize: 7.5, color: "#777", textTransform: "uppercase", marginBottom: 3 },
  th: { flexDirection: "row", backgroundColor: "#f6e4ec", paddingVertical: 5, paddingHorizontal: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5, marginTop: 14 },
  td: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottom: "0.5pt solid #e5e5e5" },
  branch: { fontFamily: "Helvetica-Bold", marginTop: 12, fontSize: 10, color: pink },
});
const aed = (fils: number) => (fils / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const ITEMS = [
  { code: "BD-UNI-01", name: "Spa tunic, black with pink piping", price: 8000 },
  { code: "BD-UNI-02", name: "Spa trousers, black", price: 5800 },
];
const SPLIT = [
  [
    [ITEMS[0], "S", 3], [ITEMS[0], "M", 4], [ITEMS[0], "L", 2], [ITEMS[1], "28", 3], [ITEMS[1], "30", 4], [ITEMS[1], "32", 2],
  ],
  [
    [ITEMS[0], "S", 2], [ITEMS[0], "M", 3], [ITEMS[1], "28", 2], [ITEMS[1], "30", 3],
  ],
] as const;

export async function bedashingPo() {
  const p = practiceDb();
  const [c] = await p.select().from(customers).where(eq(customers.name, "Bedashing Beauty Lounge SP LLC"));
  const branches = c ? await p.select().from(customerBranches).where(and(eq(customerBranches.customerId, c.id), inArray(customerBranches.name, SAMPLE_BRANCHES))) : [];
  const date = addDaysISO(todayISO(), -1);
  let subtotal = 0;
  const groups = SAMPLE_BRANCHES.map((name, i) => {
    const b = branches.find((x) => x.name === name);
    const lines = SPLIT[i].map(([item, size, qty]) => {
      const total = item.price * qty;
      subtotal += total;
      return { item, size, qty, total };
    });
    return { name, address: b?.address ?? "", lines };
  });
  const vat = Math.round(subtotal * 0.05);
  const doc = (
    <Document title={`Purchase Order ${SAMPLE_PO_NUMBER}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View>
            <Text style={s.brand}>BEDASHING</Text>
            <Text style={s.small}>Bedashing Beauty Lounge SP LLC</Text>
            <Text style={s.small}>Procurement, Head Office, Abu Dhabi, UAE</Text>
          </View>
          <View>
            <Text style={s.title}>PURCHASE ORDER</Text>
            <Text style={[s.small, { textAlign: "right" }]}>PO No: {SAMPLE_PO_NUMBER}</Text>
            <Text style={[s.small, { textAlign: "right" }]}>Date: {day(date)}</Text>
            <Text style={[s.small, { textAlign: "right" }]}>Required by: {day(addDaysISO(date, 21))}</Text>
          </View>
        </View>
        <View style={s.row}>
          <View style={[s.box, { marginRight: 8 }]}>
            <Text style={s.label}>Supplier</Text>
            <Text>Fashion Fiesta Ladies Tailoring and Textiles</Text>
            <Text style={s.small}>Shabiya 12, Mussafah, Abu Dhabi</Text>
          </View>
          <View style={s.box}>
            <Text style={s.label}>Deliver to</Text>
            <Text>Two branches, one delivery note each</Text>
            <Text style={s.small}>{SAMPLE_BRANCHES.join(" and ")}</Text>
          </View>
        </View>
        {groups.map((g) => (
          <View key={g.name} wrap={false}>
            <Text style={s.branch}>Branch: {g.name}</Text>
            <Text style={s.small}>{g.address}</Text>
            <View style={s.th}>
              <Text style={{ width: 70 }}>Item code</Text>
              <Text style={{ flex: 1 }}>Description</Text>
              <Text style={{ width: 40 }}>Size</Text>
              <Text style={{ width: 35, textAlign: "right" }}>Qty</Text>
              <Text style={{ width: 60, textAlign: "right" }}>Unit AED</Text>
              <Text style={{ width: 70, textAlign: "right" }}>Amount AED</Text>
            </View>
            {g.lines.map((l, i) => (
              <View key={i} style={s.td}>
                <Text style={{ width: 70 }}>{l.item.code}</Text>
                <Text style={{ flex: 1 }}>{l.item.name}</Text>
                <Text style={{ width: 40 }}>{l.size}</Text>
                <Text style={{ width: 35, textAlign: "right" }}>{l.qty}</Text>
                <Text style={{ width: 60, textAlign: "right" }}>{aed(l.item.price)}</Text>
                <Text style={{ width: 70, textAlign: "right" }}>{aed(l.total)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={{ alignSelf: "flex-end", width: 220, marginTop: 14 }}>
          {[
            ["Subtotal", aed(subtotal)],
            ["VAT 5%", aed(vat)],
            ["Total AED", aed(subtotal + vat)],
          ].map(([k, v]) => (
            <View key={k} style={[s.row, { justifyContent: "space-between", paddingVertical: 3, borderBottom: "0.5pt solid #ddd" }]}>
              <Text style={k === "Total AED" ? { fontFamily: "Helvetica-Bold" } : {}}>{k}</Text>
              <Text style={k === "Total AED" ? { fontFamily: "Helvetica-Bold" } : {}}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 22 }}>
          <Text style={s.label}>Terms</Text>
          <Text>Please quote our PO number on your delivery note and tax invoice. Deliver each branch separately. Payment 30 days from invoice.</Text>
        </View>
        <Text style={{ marginTop: 30 }}>Authorised by: Procurement Team, Bedashing</Text>
        <Text style={[s.small, { position: "absolute", bottom: 24, left: 40 }]}>Sample document for Fashion Fiesta Practice mode.</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

async function sheet(rows: (string | number)[][], widths: number[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/node");
  const data = rows.map((r, i) => r.map((v) => ({ value: v, ...(i === 0 ? { fontWeight: "bold" as const, backgroundColor: "#F3EEE7" } : {}) })));
  return writeXlsxFile(data as never, { columns: widths.map((width) => ({ width })) } as never).toBuffer();
}

/** A fabric order as a supplier would send it: one fabric they already stock, one new. */
export function fabricPoSheet() {
  return sheet(
    [
      ["Fabric", "Colour", "Metres", "Price per metre AED"],
      ["Linen", "Beige", 40, 22],
      ["Crepe", "Navy", 60, 14],
      ["Chiffon", "Dusty pink", 25, 16],
    ],
    [24, 16, 10, 20],
  );
}

/** Bedashing staff with their sizes, ready for the Staff tab's Excel import. */
export function staffSheet() {
  return sheet(
    [
      ["Name", "Branch", "Role", "Sizes"],
      ["Reem Al Hashmi", "Khalifa City A", "Branch manager", "Top M, Pant 30"],
      ["Lina Haddad", "Khalifa City A", "Therapist", "Top S, Pant 28"],
      ["Priya Nair", "Khalifa City A", "Nail technician", "Top M, Pant 30"],
      ["Fatima Zahra", "Al Barsha", "Therapist", "Top L, Pant 32"],
      ["Chloe Martin", "Al Barsha", "Receptionist", "Top S, Pant 26"],
      ["Mariam Saleh", "Delma", "Therapist", "Top M, Pant 30"],
      ["Ana Reyes", "Delma", "Hair stylist", "Top XL, Pant 34"],
    ],
    [22, 18, 18, 20],
  );
}
