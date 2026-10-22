import { auth } from "@/lib/auth";
import { BACKUP_PREFIX, decrypt, listBackups } from "@/lib/backup";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Opens one nightly backup for an owner: fetched, decrypted, handed over as Excel. */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "owner") return new Response("Sign in as an owner.", { status: 401 });
  const pathname = new URL(request.url).searchParams.get("path") ?? "";
  if (!pathname.startsWith(BACKUP_PREFIX)) return new Response("Not found", { status: 404 });
  const blob = (await listBackups()).find((b) => b.pathname === pathname);
  if (!blob) return new Response("Not found", { status: 404 });
  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return new Response("Could not open the backup.", { status: 502 });
  const plain = decrypt(Buffer.from(await res.arrayBuffer()));
  const date = pathname.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "backup";
  return new Response(new Uint8Array(plain), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fashion-fiesta-backup-${date}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
