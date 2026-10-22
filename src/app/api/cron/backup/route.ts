import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { runBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Called by Vercel Cron every night. Vercel sends the CRON_SECRET as a bearer token. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Not allowed", { status: 401 });
  const result = await runBackup();
  await logActivity({ entityType: "settings", action: "created", summary: `Nightly backup saved: ${result.tables} tables, ${result.rows} rows${result.removed ? `, ${result.removed} old copies removed` : ""}` });
  return NextResponse.json({ ok: true, ...result });
}
