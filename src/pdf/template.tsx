import path from "node:path";
import { readFileSync } from "node:fs";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
type Style = NonNullable<React.ComponentProps<typeof View>["style"]>;

const fontDir = path.join(process.cwd(), "assets/fonts");
let registered = false;
export function registerFonts() {
  if (registered) return;
  Font.register({
    family: "Fraunces",
    fonts: [
      { src: path.join(fontDir, "fraunces-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "fraunces-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: "Manrope",
    fonts: [
      { src: path.join(fontDir, "manrope-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "manrope-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(fontDir, "manrope-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  // Documents never break words with hyphens.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

let logo: Buffer | null = null;
function logoData() {
  logo ??= readFileSync(path.join(process.cwd(), "public/brand/logo.png"));
  return logo;
}

export const C = {
  paper: "#FAF7F2",
  paperDeep: "#F3EEE7",
  ink: "#1F1A17",
  muted: "#6F6560",
  line: "#E8E1D9",
  brand: "#D7182A",
  brandDeep: "#B3121F",
  sky: "#00AEEF",
  sun: "#FFD200",
  leaf: "#8DC63F",
  magenta: "#E6007E",
};

export const s = StyleSheet.create({
  page: { fontFamily: "Manrope", fontSize: 9, color: C.ink, paddingBottom: 96 },
  band: { backgroundColor: C.brand, paddingHorizontal: 36, paddingVertical: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoChip: { backgroundColor: "#FFFFFF", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  title: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, color: "#FFFFFF", textAlign: "right" },
  titleSub: { color: "#FFFFFF", fontSize: 10, textAlign: "right", marginTop: 3, opacity: 0.9 },
  stripe: { flexDirection: "row", height: 4 },
  body: { paddingHorizontal: 36, paddingTop: 22 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 7.5, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  strong: { fontWeight: 700 },
  muted: { color: C.muted },
  lineGap: { marginTop: 1.5 },
  name: { fontSize: 12, fontWeight: 700, marginBottom: 2 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2.5 },
  metaKey: { color: C.muted, width: 92, textAlign: "right", marginRight: 8 },
  metaVal: { fontWeight: 600, width: 110, textAlign: "right" },
  th: { flexDirection: "row", backgroundColor: C.paperDeep, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, marginTop: 18 },
  thText: { fontSize: 7.5, fontWeight: 700, color: C.muted, letterSpacing: 0.6, textTransform: "uppercase" },
  tr: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 0.75, borderBottomColor: C.line },
  totals: { alignSelf: "flex-end", width: 230, marginTop: 14, borderWidth: 0.75, borderColor: C.line, borderRadius: 10, padding: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 6, marginTop: 2, marginBottom: 4 },
  grandText: { fontFamily: "Fraunces", fontWeight: 600, fontSize: 14 },
  note: { marginTop: 16, backgroundColor: C.paper, borderRadius: 8, padding: 10, fontSize: 8.5, lineHeight: 1.4 },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24 },
  footerRule: { flexDirection: "row", height: 2, marginBottom: 8 },
  footerText: { fontSize: 7.5, color: C.muted, lineHeight: 1.45 },
  pageNo: { position: "absolute", right: 36, bottom: 12, fontSize: 7, color: C.muted },
});

export type Company = {
  tradeName: string;
  legalName: string;
  address: string;
  trn: string;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  accountName: string | null;
  iban: string | null;
  swift: string | null;
  accountNumber: string | null;
};

export function Stripe({ height = 4, style }: { height?: number; style?: Style }) {
  return (
    <View style={[s.stripe, { height }, style ?? {}]}>
      {[C.sky, C.sun, C.leaf, C.magenta].map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

export function aed(fils: number) {
  const v = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(fils) / 100);
  return `${fils < 0 ? "(" : ""}${v}${fils < 0 ? ")" : ""}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function day(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function Meta({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <View>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <View key={k} style={s.metaRow}>
            <Text style={s.metaKey}>{k}</Text>
            <Text style={s.metaVal}>{v}</Text>
          </View>
        ))}
    </View>
  );
}

export function Party({ label, name, lines }: { label: string; name: string; lines: (string | null | undefined)[] }) {
  return (
    <View style={{ maxWidth: 250 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.name}>{name}</Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={[s.muted, s.lineGap]}>
          {l}
        </Text>
      ))}
    </View>
  );
}

export function Totals({ rows, grand, after, paid }: { rows: [string, string][]; grand: [string, string]; after?: [string, string, boolean?][]; paid?: boolean }) {
  const box = (
    <View style={paid ? [s.totals, { marginTop: 0 }] : s.totals} wrap={false}>
      {rows.map(([k, v]) => (
        <View key={k} style={s.totalRow}>
          <Text style={s.muted}>{k}</Text>
          <Text>{v}</Text>
        </View>
      ))}
      <View style={rows.length ? s.grand : [s.grand, { borderTopWidth: 0, paddingTop: 0, marginTop: 0 }]}>
        <Text style={{ fontWeight: 700, paddingTop: 3 }}>{grand[0]}</Text>
        <Text style={s.grandText}>{grand[1]}</Text>
      </View>
      {after?.map(([k, v, strong]) => (
        <View key={k} style={s.totalRow}>
          <Text style={strong ? { fontWeight: 700, color: C.brandDeep } : s.muted}>{k}</Text>
          <Text style={strong ? { fontWeight: 700, color: C.brandDeep } : {}}>{v}</Text>
        </View>
      ))}
    </View>
  );
  if (!paid) return box;
  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 14 }} wrap={false}>
      <View style={{ marginRight: 28, borderWidth: 2, borderColor: C.brand, borderRadius: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 2, transform: "rotate(-8deg)" }}>
        <Text style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 24, letterSpacing: 4, color: C.brand }}>PAID</Text>
      </View>
      {box}
    </View>
  );
}

/** Signature lines (optional) on the left, the authorised signatory and stamp box on the right. */
export function SignOff({ children, stamp }: { children?: React.ReactNode; stamp?: string | null }) {
  return (
    <View style={[s.row, { marginTop: 32, alignItems: "flex-end" }]} wrap={false}>
      <View style={{ flexDirection: "row" }}>{children}</View>
      <View style={{ width: 180, height: 76, borderWidth: 0.75, borderColor: C.line, borderRadius: 10, padding: 8, justifyContent: "flex-end" }}>
        {/* The shop stamp, when switched on in Settings. The signature stays by hand. */}
        {stamp ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={stamp} style={{ position: "absolute", right: 10, top: 6, height: 50, maxWidth: 110, objectFit: "contain" }} />
        ) : null}
        <Text style={[s.label, { marginBottom: 0 }]}>Authorised signatory and stamp</Text>
      </View>
    </View>
  );
}

/**
 * The shared frame: red band with the logo chip and the document title,
 * the four colour stripe, company block, and a footer with bank details.
 */
export function DocShell({
  title,
  subtitle,
  company,
  terms,
  bank: showBank = true,
  thanks,
  children,
}: {
  title: string;
  subtitle?: string;
  company: Company;
  terms?: string;
  /** Bank details in the footer. Off for documents that ask for no payment: contact details instead. */
  bank?: boolean;
  /** Closing line. Customer documents thank them for choosing the shop. */
  thanks?: string;
  children: React.ReactNode;
}) {
  registerFonts();
  const contact = [company.phone, company.email].filter(Boolean).join("   ");
  const bank = [
    company.bankName && `Bank: ${company.bankName}`,
    company.accountName && `Account name: ${company.accountName}`,
    company.iban && `IBAN: ${company.iban}`,
    company.accountNumber && `Account: ${company.accountNumber}`,
    company.swift && `SWIFT: ${company.swift}`,
  ].filter(Boolean);
  return (
    <Document title={`${title} ${subtitle ?? ""}`.trim()} author={company.legalName} creator="Fashion Fiesta Studio">
      <Page size="A4" style={s.page}>
        <View fixed>
          <View style={s.band}>
            <View style={s.logoChip}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={{ data: logoData(), format: "png" }} style={{ width: 92, height: 52 }} />
            </View>
            <View>
              <Text style={s.title}>{title}</Text>
              {subtitle ? <Text style={s.titleSub}>{subtitle}</Text> : null}
            </View>
          </View>
          <Stripe />
        </View>
        <View style={s.body}>
          <View style={[s.row, { marginBottom: 16 }]}>
            <View style={{ maxWidth: 270 }}>
              <Text style={[s.strong, { fontSize: 9.5 }]}>{company.legalName}</Text>
              <Text style={[s.muted, s.lineGap]}>{company.address}</Text>
              <Text style={[s.muted, s.lineGap]}>TRN {company.trn}</Text>
              {company.phone || company.email ? <Text style={[s.muted, s.lineGap]}>{[company.phone, company.email].filter(Boolean).join("   ")}</Text> : null}
            </View>
          </View>
          {children}
        </View>
        <View style={s.footer} fixed>
          <Stripe height={2} style={{ marginBottom: 8 }} />
          <View style={s.row}>
            <View style={{ maxWidth: 300 }}>
              {showBank && bank.length ? (
                <>
                  <Text style={[s.footerText, s.strong, { color: C.ink }]}>Pay by bank transfer</Text>
                  <Text style={s.footerText}>{bank.join("   ")}</Text>
                </>
              ) : null}
              {!showBank && contact ? (
                <>
                  <Text style={[s.footerText, s.strong, { color: C.ink }]}>Contact us</Text>
                  <Text style={s.footerText}>{contact}</Text>
                </>
              ) : null}
              {terms ? <Text style={s.footerText}>{terms}</Text> : null}
            </View>
            <Text style={[s.footerText, { fontFamily: "Fraunces", fontSize: 10, color: C.brand, alignSelf: "flex-end" }]}>{thanks ?? `Thank you for choosing ${company.tradeName}.`}</Text>
          </View>
        </View>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

/** Lines table. Columns flex to fit; amounts right aligned. */
export function LinesTable({
  columns,
  rows,
}: {
  columns: { title: string; flex: number; align?: "left" | "right" }[];
  rows: string[][];
}) {
  return (
    <View>
      <View style={s.th} fixed>
        {columns.map((c) => (
          <Text key={c.title} style={[s.thText, { flex: c.flex, textAlign: c.align ?? "left" }]}>
            {c.title}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr} wrap={false}>
          {r.map((cell, j) => (
            <Text key={j} style={{ flex: columns[j].flex, textAlign: columns[j].align ?? "left", fontWeight: j === 0 ? 600 : 400, paddingRight: j === 0 ? 8 : 0 }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}
