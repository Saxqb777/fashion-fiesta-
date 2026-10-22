import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MAX_BYTES = 6 * 1024 * 1024;
const FOLDERS = new Set(["fabrics", "tasks", "brand"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") ?? "");
  if (!FOLDERS.has(folder)) return NextResponse.json({ error: "Unknown folder." }, { status: 400 });
  // The shop stamp: owners only, PNG or JPEG so it prints on PDFs.
  if (folder === "brand" && session.user.role !== "owner") return NextResponse.json({ error: "Owners only." }, { status: 403 });
  if (folder === "brand" && file instanceof File && !["image/png", "image/jpeg"].includes(file.type)) {
    return NextResponse.json({ error: "Use a PNG or JPG image of the stamp." }, { status: 400 });
  }
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
