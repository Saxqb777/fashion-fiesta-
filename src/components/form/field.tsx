import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";

type Common = {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  errors?: string[];
  className?: string;
};

function FieldFrame({
  name,
  label,
  hint,
  errors,
  className,
  children,
}: Common & { children: React.ReactNode }) {
  const error = errors?.[0];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-[13px] font-medium text-brand-deep">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  errors,
  className,
  ...input
}: Common & Omit<React.ComponentProps<"input">, "name" | "id">) {
  const invalid = Boolean(errors?.length);
  return (
    <FieldFrame name={name} label={label} hint={hint} errors={errors} className={className}>
      <Input
        id={name}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${name}-error` : hint ? `${name}-hint` : undefined}
        {...input}
      />
    </FieldFrame>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  errors,
  className,
  ...input
}: Common & Omit<React.ComponentProps<"textarea">, "name" | "id">) {
  const invalid = Boolean(errors?.length);
  return (
    <FieldFrame name={name} label={label} hint={hint} errors={errors} className={className}>
      <Textarea
        id={name}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${name}-error` : hint ? `${name}-hint` : undefined}
        {...input}
      />
    </FieldFrame>
  );
}

export function SelectField({
  name,
  label,
  hint,
  errors,
  className,
  children,
  ...select
}: Common & Omit<React.ComponentProps<"select">, "name" | "id">) {
  return (
    <FieldFrame name={name} label={label} hint={hint} errors={errors} className={className}>
      <select
        id={name}
        name={name}
        className="h-11 w-full appearance-none rounded-[10px] border border-line bg-surface bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236F6560%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat px-3.5 pr-10 text-base text-ink outline-none focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-brand/20"
        {...select}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function FormMessage({ message, tone = "error" }: { message?: string; tone?: "error" | "success" }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className={cn(
        "rounded-[10px] px-3.5 py-2.5 text-sm font-medium",
        tone === "error" ? "bg-brand-soft text-brand-deep" : "bg-leaf/15 text-ink",
      )}
    >
      {message}
    </p>
  );
}
