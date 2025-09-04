import React from "react";

/** tiny class helper (no deps) */
const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

/* ========== Layout ========== */
export function Page({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-white">{children}</div>;
}
export function Container({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>; // width clamp happens in App.tsx
}

/* ========== Header (pill tabs; active = white) ========== */
type HeaderTab = { id: string; label: string; active?: boolean; onClick?: () => void };

export function HeaderBar({
  title,
  subtitle,
  tabs = [],
}: {
  title: string;
  subtitle?: string;
  tabs?: HeaderTab[];
}) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="space-y-0.5">
          <h1 className="text-sm font-semibold">{title}</h1>
          {subtitle ? <p className="text-xs text-white/60">{subtitle}</p> : null}
        </div>

        {tabs.length > 0 && (
          <nav className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={t.onClick}
                className={cx(
                  "h-10 rounded-full border px-4 text-sm font-medium transition",
                  "focus:outline-none focus-visible:outline-none",
                  t.active
                    ? "border-white bg-white text-black"
                    : "border-white/15 bg-transparent text-white hover:border-white/30"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}

/* ========== Content primitives ========== */
export function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={cx("text-sm font-semibold text-white/90", className)}>{children}</h2>;
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-sm", className)}>
      {title ? (
        <header className="border-b border-white/10 p-4">
          <h3 className="text-base font-semibold">{title}</h3>
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ========== Form controls (MVP) ========== */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { className?: string }
>(function InputBase({ className = "", ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cx(
        "w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-base outline-none",
        "placeholder:text-white/40 focus:border-white/30", // lighter placeholder
        "focus-visible:outline-none",
        className
      )}
    />
  );
});

export function Button({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(
        "h-10 rounded-lg border border-white/15 px-3 text-sm font-semibold",
        "hover:border-white/30 active:scale-[.99] transition",
        "focus-visible:outline-none",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Primary action (Clock-in/out) – consistent height/shape */
export function ActionButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cx(
        "h-10 w-full rounded-lg border px-3 text-sm font-semibold",
        "border-white/20 bg-white/5 hover:bg-white/10 active:scale-[.99] transition",
        "focus-visible:outline-none",
        className
      )}
    >
      {children}
    </button>
  );
}

/* ========== Subtle & Tile ========== */
export function Subtle({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-white/60">{children}</span>;
}

export function Tile({
  title,
  children,
  minH,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  minH?: number;
  className?: string;
}) {
  return (
    <div
      className={cx("rounded-xl border border-white/12 bg-black/30 p-3", className)}
      style={minH ? { minHeight: minH } : undefined}
    >
      {title ? <div className="mb-2 text-sm font-medium text-white/80">{title}</div> : null}
      {children}
    </div>
  );
}
