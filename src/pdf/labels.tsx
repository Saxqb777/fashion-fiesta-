import { Document, Page, renderToBuffer, Text, View } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerBranches, customers, salesOrders, type LabelLayout } from "@/db/schema";
import { orderPieces } from "@/lib/accounts";
import { DEFAULT_LABEL_LAYOUT } from "@/lib/label-layouts";
import { getSettings } from "@/lib/settings";
import { C, registerFonts } from "./template";

const MM = 72 / 25.4;

/** Garment labels for every piece of an order, on the sheet set in Settings. */
export async function renderLabels(orderId: string, opts: { branchId?: string } = {}) {
  const order = await db.query.salesOrders.findFirst({ where: eq(salesOrders.id, orderId) });
  if (!order) return null;
  const [customer, branches, settings, all] = await Promise.all([
    db.query.customers.findFirst({ where: eq(customers.id, order.customerId) }),
    db.select().from(customerBranches).where(eq(customerBranches.customerId, order.customerId)),
    getSettings(),
    orderPieces(order.id),
  ]);
  const pieces = opts.branchId ? all.filter((p) => p.branchId === opts.branchId) : all;
  const layout: LabelLayout = settings.labelLayout ?? DEFAULT_LABEL_LAYOUT;
  const perPage = layout.cols * layout.rows;
  const pages = Array.from({ length: Math.max(1, Math.ceil(pieces.length / perPage)) }, (_, i) => pieces.slice(i * perPage, (i + 1) * perPage));
  // Text scales with the label, so a small thermal label stays readable.
  const k = Math.min(1.15, Math.max(0.7, layout.heightMm / 37));
  const branchOf = (id: string | null) => branches.find((b) => b.id === id);

  registerFonts();
  const element = (
    <Document title={`Labels ${order.number ?? ""}`} author={settings.tradeName}>
      {pages.map((page, pi) => (
        <Page key={pi} size={[layout.pageWidthMm * MM, layout.pageHeightMm * MM]} style={{ fontFamily: "Manrope", color: C.ink }}>
          {page.map((p, i) => {
            const col = i % layout.cols;
            const row = Math.floor(i / layout.cols);
            const b = branchOf(p.branchId);
            const headline = p.person ?? b?.name ?? customer?.name ?? "";
            return (
              <View
                key={p.key}
                style={{
                  position: "absolute",
                  left: (layout.leftMm + col * (layout.widthMm + layout.gapXMm)) * MM,
                  top: (layout.topMm + row * (layout.heightMm + layout.gapYMm)) * MM,
                  width: layout.widthMm * MM,
                  height: layout.heightMm * MM,
                  padding: 7 * k,
                  paddingLeft: 10 * k,
                }}
              >
                <View style={{ position: "absolute", left: 4 * k, top: 7 * k, bottom: 7 * k, width: 2, backgroundColor: C.brand }} />
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 6 * k, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", maxWidth: "70%" }}>{customer?.name}</Text>
                  <Text style={{ fontSize: 6 * k, fontWeight: 700, color: C.muted }}>{order.number}</Text>
                </View>
                <Text style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 12 * k, marginTop: 3 * k }} wrap={false}>
                  {headline}
                </Text>
                <Text style={{ fontSize: 8 * k, fontWeight: 600, marginTop: 1.5 * k, maxHeight: 20 * k }}>{p.description}</Text>
                {p.size ? <Text style={{ fontSize: 8 * k, fontWeight: 700, marginTop: 1 * k }}>Size {p.size}</Text> : null}
                <View style={{ position: "absolute", left: 10 * k, right: 7 * k, bottom: 6 * k, flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 6.5 * k, color: C.muted, maxWidth: "75%" }}>{p.person && b ? [b.name, b.emirate].filter(Boolean).join(", ") : (b?.emirate ?? "")}</Text>
                  <Text style={{ fontSize: 6.5 * k, fontWeight: 700 }}>
                    {p.n} of {p.of}
                  </Text>
                </View>
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
  const buffer = await renderToBuffer(element);
  return { buffer, filename: `Labels ${order.number ?? "draft"}.pdf`, count: pieces.length };
}
