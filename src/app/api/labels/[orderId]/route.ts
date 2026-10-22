import { auth } from "@/lib/auth";
import { pdfResponse } from "@/pdf/documents";
import { renderLabels } from "@/pdf/labels";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "owner") return new Response("Sign in as an owner.", { status: 401 });
  const { orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return new Response("Not found", { status: 404 });
  const branch = new URL(request.url).searchParams.get("branch");
  const doc = await renderLabels(orderId, { branchId: branch && /^[0-9a-f-]{36}$/.test(branch) ? branch : undefined });
  if (!doc) return new Response("Not found", { status: 404 });
  return pdfResponse(doc.buffer, doc.filename);
}
