import Link from "next/link";

const TONES = ["#D7182A", "#E6007E", "#00AEEF", "#8DC63F", "#FFD200", "#B3121F", "#6F6560"];

/** Branches across the emirates as one proportional bar. Each emirate opens its branches. */
export function EmirateStrip({ customerId, groups }: { customerId: string; groups: { emirate: string; count: number }[] }) {
  const total = groups.reduce((s, g) => s + g.count, 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-paper-deep" role="img" aria-label={groups.map((g) => `${g.emirate} ${g.count}`).join(", ")}>
        {groups.map((g, i) => (
          <span key={g.emirate} className="h-full border-r-2 border-surface last:border-r-0" style={{ width: `${(g.count / total) * 100}%`, background: TONES[i % TONES.length] }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {groups.map((g, i) => (
          <li key={g.emirate}>
            <Link href={`/customers/${customerId}?tab=branches&emirate=${encodeURIComponent(g.emirate)}`} scroll={false} className="group flex items-baseline gap-2">
              <span className="size-2 translate-y-[-1px] rounded-full" style={{ background: TONES[i % TONES.length] }} />
              <span className="text-[14px] font-semibold group-hover:underline">{g.emirate}</span>
              <span className="tabular font-display text-[1.35rem] leading-none">{g.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
