import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MAX_BYTES = 6 * 1024 * 1024;
const FOLDERS = new Set(["fabrics", "tasks"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "");
  if (!FOLDERS.has(folder)) return NextResponse.json({ error: "Unknown folder." }, { status: 400 });
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large." }, { status: 413 });

  const blob = await put(`${folder}/${file.name || "photo.jpg"}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return NextResponse.json({ url: blob.url });
}
