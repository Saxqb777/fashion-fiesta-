import type { User } from "@/db/schema";
import { RoleTag } from "@/components/people/role-tag";

export function PeopleList({ people, meId }: { people: User[]; meId: string }) {
  return (
    <ul className="flex flex-col gap-2">
      {people.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {p.name}
              {p.id === meId ? <span className="ml-1.5 text-xs font-medium text-ink-muted">(you)</span> : null}
            </p>
            <p className="truncate text-[13px] text-ink-muted">{[p.email, p.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <RoleTag role={p.role} />
        </li>
      ))}
    </ul>
  );
}
