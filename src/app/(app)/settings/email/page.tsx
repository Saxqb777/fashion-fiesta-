import { EmailSettingsForm } from "@/components/settings/email-settings-form";
import { DEFAULT_TEMPLATE, domainStatus, EMAIL_DOC_LABEL } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { requireOwner } from "@/lib/session";
import { SHARE_TYPES } from "@/lib/share";
import { cn } from "cn";
import { SettingsSection } from "../settings-section";

export default async function EmailSettings() {
  const me = await requireOwner();
  const [s, status] = await Promise.all([getSettings(), domainStatus()]);
  const domain = process.env.EMAIL_DOMAIN ?? "fashionfiestauae.com";
  const verified = status?.status === "verified";
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection title="Email" description="Documents go from the shop's own address. Replies land in the inbox of the owner who sent them.">
        <p className={cn("text-[15px] font-semibold", verified ? "text-[#4d7a12]" : "text-brand-deep")}>
          {verified
            ? `Connected. Emails go from ${s.emailFromLocal}@${domain}.`
            : status === null
              ? "Not connected yet. The email service key still needs to be added."
              : status.status === "not_added"
                ? `Waiting: ${domain} is not registered with the email service yet.`
                : "Waiting for the domain records. Sending starts by itself once they are live."}
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">Your replies go to {me.email}.</p>
        {status && !verified && status.records.length ? (
          <div className="mt-4 overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {status.records.map((r) => (
                  <tr key={`${r.type}${r.name}`} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-semibold">{r.type}</td>
                    <td className="px-3 py-2 break-all">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-[12px] break-all">
                      {r.value}
                      {r.priority !== undefined ? ` (priority ${r.priority})` : ""}
                    </td>
                    <td className={cn("px-3 py-2 font-semibold", r.status === "verified" ? "text-[#4d7a12]" : "text-ink-muted")}>{r.status === "verified" ? "Live" : "Waiting"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SettingsSection>
      <EmailSettingsForm
        domain={domain}
        fromName={s.emailFromName ?? ""}
        tradeName={s.tradeName}
        fromLocal={s.emailFromLocal}
        templates={s.emailTemplates ?? {}}
        docs={SHARE_TYPES.map((t) => ({ type: t, label: EMAIL_DOC_LABEL[t] }))}
        defaults={DEFAULT_TEMPLATE}
      />
    </div>
  );
}
