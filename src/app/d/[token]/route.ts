import { practiceAvailable, withDb } from "@/db";
import { pdfResponse, renderDoc } from "@/pdf/documents";
import { readShareToken } from "@/lib/share";

export const runtime = "nodejs";

/** Public link sent on WhatsApp. Opens one document only, no login. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ref = readShareToken(token.replace(/\.pdf$/, ""));
  if (!ref) return new Response("This link is not valid.", { status: 404 });
  // A link shared from Practice opens the sandbox copy, never a real record.
  if (ref.practice && !practiceAvailable()) return new Response("This link is not valid.", { status: 404 });
  const doc = await withDb(ref.practice ? "practice" : "live", () => renderDoc(ref.type, ref.id));
  if (!doc) return new Response("This document is no longer available.", { status: 404 });
  return pdfResponse(doc.buffer, doc.filename);
}
