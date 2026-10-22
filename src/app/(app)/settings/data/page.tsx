import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listBackups } from "@/lib/backup";
import { requireOwner } from "@/lib/session";
import { SettingsSection } from "../settings-section";

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function DataSettings() {
  await requireOwner();
  const backups = await listBackups().catch(() => []);
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title="Your data" description="Everything in the app, one Excel sheet per table: customers, orders, invoices, payments, stock, all of it. Yours to keep, whatever happens.">
        <Button nativeButton={false} render={<a href="/api/backup/now" />} size="lg">
          <DownloadIcon />
          Download everything now
        </Button>
        <p className="mt-2 text-[13px] text-ink-muted">Takes a few seconds. Passwords are never included.</p>
      </SettingsSection>
      <SettingsSection title="Nightly backups" description="Every night at 2:00 the app saves a full copy, locked so only this app can open it. Copies are kept for 30 days.">
        {backups.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-[14px] border border-line">
            {backups.map((b) => (
              <li key={b.pathname} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{fmt.format(b.uploadedAt)}</p>
                  <p className="tabular text-[13px] text-ink-muted">{(b.size / 1024).toFixed(0)} KB</p>
                </div>
                <Button nativeButton={false} variant="outline" size="sm" render={<a href={`/api/backup/file?path=${encodeURIComponent(b.pathname)}`} />}>
                  <DownloadIcon />
                  Download
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-ink-muted">The first nightly copy appears here tomorrow morning.</p>
        )}
      </SettingsSection>
    </div>
  );
}
