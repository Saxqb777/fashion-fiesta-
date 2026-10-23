export function SettingsSection({
  title,
  description,
  guide,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Mark for the setup guide to point at. */
  guide?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7" data-guide={guide}>
      <h2 className="text-xl font-medium">{title}</h2>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
