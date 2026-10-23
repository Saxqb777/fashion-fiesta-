import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/lib/auth";
import { pickVatPeriod } from "@/lib/report-registry";
import { getSettings } from "@/lib/settings";
import { pdfResponse } from "@/pdf/documents";
import { day } from "@/pdf/template";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Tax downloads for the accountant and the e-invoicing provider:
 * vat-pack (PDF, ?q=), corporate (PDF, ?y=), xml (?kind=invoice|credit&id=), einvoices (zip of a quarter, ?q=).
 */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "owner") return new Response("Sign in as an owner.", { status: 401 });
  const { file } = await params;
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  if (file === "vat-pack") {
    const { period } = await pickVatPeriod(url.searchParams.get("q"));
    const [{ vatPack, dueDateFor }, { periodStates }, { VatPackDoc }, settings] = await Promise.all([import("@/lib/tax/vat"), import("@/lib/tax/periods"), import("@/pdf/tax"), getSettings()]);
    const [pack, states] = await Promise.all([vatPack(period), periodStates([period])]);
    const st = states.get(period.start)!;
    const status = st.status === "filed" ? `Filed${st.filedOn ? ` ${day(st.filedOn)}` : ""}${st.reference ? `, ref ${st.reference}` : ""}` : st.status === "pack_ready" ? "Pack ready" : "Not started";
    const buffer = await renderToBuffer(<VatPackDoc company={settings} label={period.label} start={period.start} end={period.end} due={dueDateFor(period)} pack={pack} status={status} review={st.review} />);
    return pdfResponse(buffer, `VAT return pack ${period.start}.pdf`, download);
  }

  if (file === "corporate") {
    const [{ corporatePack, corporateYears }, { CorporateDoc }, settings] = await Promise.all([import("@/lib/tax/corporate"), import("@/pdf/tax"), getSettings()]);
    const years = await corporateYears();
    const y = Number(url.searchParams.get("y"));
    const pack = await corporatePack(years.includes(y) ? y : years[0]);
    const buffer = await renderToBuffer(<CorporateDoc company={settings} ctTrn={settings.ctTrn} pack={pack} />);
    return pdfResponse(buffer, `Corporate tax pack ${pack.year}.pdf`, download);
  }

  if (file === "xml") {
    const id = url.searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
    const { invoiceXml, creditNoteXml } = await import("@/lib/tax/einvoice");
    const doc = url.searchParams.get("kind") === "credit" ? await creditNoteXml(id) : await invoiceXml(id);
    if (!doc) return new Response("Not found", { status: 404 });
    return new Response(doc.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${doc.filename}"`, "Cache-Control": "no-store" } });
  }

  if (file === "einvoices") {
    const { period } = await pickVatPeriod(url.searchParams.get("q"));
    const [{ einvoiceDocs, invoiceXml, creditNoteXml }, { zipSync, strToU8 }] = await Promise.all([import("@/lib/tax/einvoice"), import("fflate")]);
    const docs = await einvoiceDocs(period);
    const files: Record<string, Uint8Array> = {};
    for (const d of docs) {
      const x = d.kind === "credit" ? await creditNoteXml(d.id) : await invoiceXml(d.id);
      if (x) files[x.filename] = strToU8(x.xml);
    }
    if (!Object.keys(files).length) return new Response("No tax invoices or credit notes in this quarter.", { status: 404 });
    return new Response(new Uint8Array(zipSync(files, { level: 6 })), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="e-invoices ${period.start}.zip"`, "Cache-Control": "no-store" },
    });
  }

  return new Response("Not found", { status: 404 });
}
