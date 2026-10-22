import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/** Vercel functions take bodies up to 4.5 MB. Machine files (DST, PES, JEF) are far smaller. */
const MAX_BYTES = 4 * 1024 * 1024;

/** Embroidery design files, any format the machine uses. Owners only. */
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "owner") return NextResponse.json({ error: "Owners only." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose the design file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB." }, { status: 413 });
  const name = (file.name || "design").replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const blob = await put(`designs/${name}`, file, { access: "public", addRandomSuffix: true, contentType: file.type || "application/octet-stream" });
  return NextResponse.json({ url: blob.url, name });
}
