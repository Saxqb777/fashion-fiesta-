import { eq } from "drizzle-orm";
import { db } from "@/db";
import { posSales } from "@/db/schema";
import { auth } from "@/lib/auth";
import { pdfResponse, renderDoc } from "@/pdf/documents";
import { SHARE_TYPES, type ShareType } from "@/lib/share";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const session = await auth();
  const { type, id } = await params;
  if (!SHARE_TYPES.includes(type as ShareType) || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  if (session?.user?.role !== "owner") {
    // A tailor can open the quick sales they made, to share the receipt.
    const own = type === "pos" && session?.user?.id ? await db.query.posSales.findFirst({ where: eq(posSales.id, id), columns: { soldBy: true } }) : undefined;
    if (!own || own.soldBy !== session?.user?.id) return new Response("Sign in as an owner.", { status: 401 });
  }
  const url = new URL(request.url);
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const doc = await renderDoc(type as ShareType, id, { from: iso(url.searchParams.get("from")), to: iso(url.searchParams.get("to")) });
  if (!doc) return new Response("Not found", { status: 404 });
  return pdfResponse(doc.buffer, doc.filename, url.searchParams.get("download") === "1");
}
