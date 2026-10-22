export function SettingsSection({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-5 sm:p-7">
      <h2 className="text-xl font-medium">{title}</h2>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}
