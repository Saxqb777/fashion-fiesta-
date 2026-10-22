import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { buildWorkbook } from "@/lib/backup";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Idea 34: one button, everything to Excel. */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "owner") return new Response("Sign in as an owner.", { status: 401 });
  const { buffer } = await buildWorkbook();
  await logActivity({ actor: { id: session.user.id, name: session.user.name }, entityType: "settings", action: "created", summary: `${session.user.name} downloaded all the shop's data to Excel` });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fashion-fiesta-${todayISO()}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
