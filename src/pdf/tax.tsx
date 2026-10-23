import { Text, View } from "@react-pdf/renderer";
import type { CorporatePack } from "@/lib/tax/corporate";
import type { Review } from "@/lib/tax/review";
import type { PurchaseDoc, SaleDoc, VatPack } from "@/lib/tax/vat";
import { aed, C, day, DocShell, LinesTable, Meta, s, type Company } from "./template";

const h2 = { fontFamily: "Fraunces", fontWeight: 600 as const, fontSize: 13, marginTop: 22, marginBottom: 2 };
const SECTION = { sales: "VAT on sales and all other outputs", purchases: "VAT on expenses and all other inputs", net: "Net VAT due" } as const;

function Heading({ children, note }: { children: string; note?: string }) {
  return (
    <View wrap={false} minPresenceAhead={60}>
      <Text style={h2}>{children}</Text>
      {note ? <Text style={[s.muted, { marginBottom: 2 }]}>{note}</Text> : null}
    </View>
  );
}

function docRows(docs: (SaleDoc | PurchaseDoc)[]) {
  const rows = docs.map((d) => [d.ref, day(d.date), d.kind, d.party, "emirate" in d ? d.emirate : (d.trn ?? "No TRN"), aed(d.net), aed(d.vat)]);
  rows.push(["Total", "", "", "", "", aed(docs.reduce((t, d) => t + d.net, 0)), aed(docs.reduce((t, d) => t + d.vat, 0))]);
  return rows;
}

const DOC_COLS = (purchases: boolean) => [
  { title: "Number", flex: 1.3 },
  { title: "Date", flex: 1.1 },
  { title: "Document", flex: 1.1 },
  { title: purchases ? "Supplier or payee" : "Customer", flex: 2 },
  { title: purchases ? "TRN" : "Emirate", flex: 1.4 },
  { title: "Before VAT", flex: 1.1, align: "right" as const },
  { title: "VAT", flex: 0.9, align: "right" as const },
];

/** The quarter for the accountant: the return box by box, the documents behind it, and the check results. */
export function VatPackDoc({
  company,
  label,
  start,
  end,
  due,
  pack,
  status,
  review,
}: {
  company: Company;
  label: string;
  start: string;
  end: string;
  due: string;
  pack: VatPack;
  status: string;
  review: Review | null;
}) {
  const box14 = pack.boxes.find((b) => b.box === "14")!;
  return (
    <DocShell title="VAT return pack" subtitle={label} company={company} bank={false} thanks="Prepared in Fashion Fiesta Studio for filing on EmaraTax.">
      <View style={[s.row, { alignItems: "flex-start" }]}>
        <View style={{ maxWidth: 260 }}>
          <Text style={s.label}>{box14.vat! >= 0 ? "VAT to pay, box 14" : "VAT to get back, box 14"}</Text>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 24 }}>AED {aed(Math.abs(box14.vat!))}</Text>
        </View>
        <Meta
          rows={[
            ["Tax period", `${day(start)} to ${day(end)}`],
            ["File and pay by", day(due)],
            ["Status", status],
            ["Prepared", day(new Date().toISOString().slice(0, 10))],
          ]}
        />
      </View>

      <Heading note="All standard rated sales are in box 1a, Abu Dhabi, where the shop is established.">The return, box by box</Heading>
      <LinesTable
        columns={[
          { title: "Box", flex: 0.6 },
          { title: "", flex: 4 },
          { title: "Amount AED", flex: 1.3, align: "right" },
          { title: "VAT AED", flex: 1.2, align: "right" },
          { title: "Adjustment", flex: 1.1, align: "right" },
        ]}
        rows={(["sales", "purchases", "net"] as const).flatMap((sec) => [
          ["", SECTION[sec].toUpperCase(), "", "", ""],
          ...pack.boxes
            .filter((b) => b.section === sec)
            .map((b) => [b.box, b.label, b.amount === null ? "" : aed(b.amount), b.vat === null ? "" : aed(b.box === "14" ? Math.abs(b.vat) : b.vat), b.adjustment === undefined ? "" : aed(b.adjustment)]),
        ])}
      />

      <Heading note={`${pack.saleDocs.length} documents. Credit notes show in brackets.`}>Sales behind boxes 1a and 8</Heading>
      {pack.saleDocs.length ? <LinesTable columns={DOC_COLS(false)} rows={docRows(pack.saleDocs)} /> : <Text style={s.muted}>No sales in this period.</Text>}

      <Heading note="Bills and expenses with VAT and the supplier's TRN.">Purchases behind boxes 9 and 11</Heading>
      {pack.purchaseDocs.some((d) => d.claimable) ? <LinesTable columns={DOC_COLS(true)} rows={docRows(pack.purchaseDocs.filter((d) => d.claimable))} /> : <Text style={s.muted}>No claimable purchases in this period.</Text>}

      {pack.unclaimed.length ? (
        <>
          <Heading note="VAT shown on these, but no supplier TRN, so it is not claimed.">VAT paid but not claimable</Heading>
          <LinesTable columns={DOC_COLS(true)} rows={docRows(pack.unclaimed)} />
        </>
      ) : null}

      {review ? (
        <>
          <Heading note={review.summary}>Checks before filing</Heading>
          {review.items.map((i) => (
            <View key={i.key} style={[s.tr, { flexDirection: "row" }]} wrap={false}>
              <Text style={{ width: 44, fontWeight: 700, color: i.level === "fix" ? C.brandDeep : C.muted, fontSize: 7.5, textTransform: "uppercase" }}>{i.level}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: 700 }}>{i.title}</Text>
                <Text style={[s.muted, { marginTop: 1.5 }]}>{i.text}</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}
    </DocShell>
  );
}

/** The year for the accountant: profit, the Small Business Relief check and the list of what they need. */
export function CorporateDoc({ company, ctTrn, pack }: { company: Company; ctTrn: string | null; pack: CorporatePack }) {
  return (
    <DocShell title="Corporate tax pack" subtitle={`Year ${pack.year}`} company={company} bank={false} thanks="Prepared in Fashion Fiesta Studio for the accountant.">
      <View style={[s.row, { alignItems: "flex-start" }]}>
        <View style={{ maxWidth: 270 }}>
          <Text style={s.label}>Operating profit from the app</Text>
          <Text style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 24 }}>AED {aed(pack.profit)}</Text>
        </View>
        <Meta
          rows={[
            ["Financial year", `${day(pack.start)} to ${day(pack.end)}`],
            ["Corporate tax TRN", ctTrn ?? "Not entered"],
            ["Return due by", day(pack.returnDue)],
            ["Months with data", `${pack.monthsWithData} of 12`],
          ]}
        />
      </View>

      <Heading note="From the app's own records, before VAT. Your accountant adds what the app does not hold, such as depreciation.">Profit and loss</Heading>
      <LinesTable columns={[{ title: "", flex: 4 }, { title: "AED", flex: 1.4, align: "right" }]} rows={pack.lines.map((l) => [l.label, aed(l.amount)])} />

      <Heading>Small Business Relief</Heading>
      <View style={s.note}>
        <Text style={{ fontWeight: 700, marginBottom: 3 }}>{pack.sbr.headline}</Text>
        <Text>{pack.sbr.text}</Text>
      </View>
      <Text style={[s.muted, { marginTop: 6 }]}>
        {`Without the relief: 0 percent on taxable income up to AED 375,000, 9 percent above. On this year's profit that would be about AED ${aed(pack.taxWithoutRelief)}.`}
      </Text>

      <Heading note="Figures at year end, from the app.">For the accountant</Heading>
      <LinesTable columns={[{ title: "Item", flex: 3 }, { title: "From the app", flex: 2, align: "right" }]} rows={pack.checklist.map((c) => [c.label, c.value ?? "Ask the owner"])} />
    </DocShell>
  );
}
