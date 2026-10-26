import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

/**
 * Design-system primitives. Server components only — interactive pieces
 * (pending buttons, copy-to-clipboard) live in client-components.tsx.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function buttonClasses({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    {
      "bg-cove-accent text-cove-accentInk shadow-sm hover:bg-cove-accent/90": variant === "primary",
      "border border-cove-border bg-cove-surface text-cove-ink shadow-sm hover:bg-cove-sunken": variant === "secondary",
      "text-cove-ink hover:bg-cove-sunken": variant === "ghost",
      "bg-cove-danger text-white shadow-sm hover:bg-cove-danger/90": variant === "danger",
      "px-2.5 py-1.5 text-xs": size === "sm",
      "px-4 py-2 text-sm": size === "md",
      "px-5 py-3 text-base": size === "lg",
    },
    className,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="submit" className={buttonClasses({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}

export function Card({
  className,
  as: As = "div",
  ...props
}: Omit<ComponentProps<"div">, "ref"> & { as?: "div" | "section" | "article" | "li" }) {
  const Tag = As as "div";
  return <Tag className={clsx("rounded-2xl border border-cove-border bg-cove-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cove-border px-5 py-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-cove-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "border-cove-border bg-cove-sunken text-cove-ink",
  // Tints stay light (≤6%) so tone-colored text keeps ≥4.5:1 contrast.
  accent: "border-cove-accent/30 bg-cove-accent/[0.06] text-cove-accent",
  success: "border-cove-success/30 bg-cove-success/[0.06] text-cove-success",
  warning: "border-cove-warning/30 bg-cove-warning/[0.06] text-cove-warning",
  danger: "border-cove-danger/30 bg-cove-danger/[0.06] text-cove-danger",
  info: "border-cove-info/30 bg-cove-info/[0.06] text-cove-info",
};

/** Status pill. Always carries text — never color alone (brief accessibility rule). */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  role,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={clsx("rounded-xl border px-4 py-3 text-sm", toneClasses[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx("text-cove-ink", title && "mt-1")}>{children}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-cove-accent">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-cove-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-cove-border bg-cove-surface/60 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-cove-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-cove-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-cove-muted">{hint}</p>}
    </Card>
  );
}

/** Usage meter with a text equivalent (not color alone). */
export function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = limit && pct >= 90 ? "bg-cove-danger" : limit && pct >= 75 ? "bg-cove-warning" : "bg-cove-accent";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-cove-muted">
          {used.toLocaleString()} / {limit === null ? "Unlimited" : limit.toLocaleString()}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-cove-sunken"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? used}
        aria-valuenow={used}
      >
        <div className={clsx("h-full rounded-full", tone)} style={{ width: limit === null ? "6%" : `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="-mt-0.5 text-xs text-cove-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-cove-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint?: boolean, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function Input({ id, error, hasHint, className, ...props }: ComponentProps<"input"> & { id: string; error?: string; hasHint?: boolean }) {
  return (
    <input
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hasHint, error)}
      className={clsx("field-control", className)}
      {...props}
    />
  );
}

export function Textarea({ id, error, hasHint, className, ...props }: ComponentProps<"textarea"> & { id: string; error?: string; hasHint?: boolean }) {
  return (
    <textarea
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hasHint, error)}
      className={clsx("field-control", className)}
      {...props}
    />
  );
}

export function Select({ id, error, hasHint, className, ...props }: ComponentProps<"select"> & { id: string; error?: string; hasHint?: boolean }) {
  return (
    <select
      id={id}
      name={props.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hasHint, error)}
      className={clsx("field-control", className)}
      {...props}
    />
  );
}

export function Checkbox({ id, label, description, ...props }: ComponentProps<"input"> & { id: string; label: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} name={props.name ?? id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-cove-border accent-[rgb(var(--cove-accent))]" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-cove-muted">{description}</span>}
      </label>
    </div>
  );
}
