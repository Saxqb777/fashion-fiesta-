import { practiceAvailable } from "@/db";
import { auth } from "@/lib/auth";
import { bedashingPo, fabricPoSheet, staffSheet } from "@/lib/practice/kit";
import { ensureSandbox } from "@/lib/practice";

export const runtime = "nodejs";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The sample kit for the missions. Owners only, and only made from the Practice sandbox. */
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "owner") return new Response("Sign in as an owner.", { status: 401 });
  if (!practiceAvailable()) return new Response("Practice is not set up.", { status: 404 });
  const { file } = await params;
  const send = (body: Buffer, type: string, name: string) =>
    new Response(new Uint8Array(body), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  switch (file) {
    case "bedashing-po.pdf":
      await ensureSandbox();
      return send(await bedashingPo(), "application/pdf", "Bedashing-PO.pdf");
    case "fabric-po.xlsx":
      return send(await fabricPoSheet(), XLSX, "Fabric-order-Al-Noor.xlsx");
    case "staff-sizes.xlsx":
      return send(await staffSheet(), XLSX, "Bedashing-staff-sizes.xlsx");
    case "order-slip.jpg":
      return Response.redirect(new URL("/practice/order-slip.jpg", request.url), 302);
    default:
      return new Response("Not found", { status: 404 });
  }
}
