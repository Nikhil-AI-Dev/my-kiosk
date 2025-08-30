// src/ui.tsx
import React from "react";

export const Page: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-black text-white">{children}</div>
);

export const Container: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <main className="max-w-6xl mx-auto p-6">{children}</main>
);

export const HeaderBar: React.FC<{
  title: string;
  subtitle?: string;
  tabs?: { id: string; label: string; active?: boolean; onClick?: () => void }[];
}> = ({ title, subtitle, tabs }) => (
  <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-white text-black grid place-content-center font-bold">⏱</div>
      <div>
        <div className="font-semibold tracking-wide text-[18px]">{title}</div>
        {subtitle && <div className="text-xs text-white/60">{subtitle}</div>}
      </div>
    </div>

    {tabs && (
      <nav className="flex gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={t.onClick}
            className={
              "px-4 py-2 rounded-xl border transition " +
              (t.active ? "bg-white text-black border-white" : "text-white border-white/30 hover:border-white/50")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>
    )}
  </header>
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[28px] font-semibold mb-4">{children}</h2>
);

export const Card: React.FC<{ title?: string; className?: string; children: React.ReactNode }> = ({
  title,
  className = "",
  children,
}) => (
  <div className={`rounded-2xl border border-white/20 p-6 ${className}`}>
    {title && <div className="text-sm text-white/60 mb-2">{title}</div>}
    {children}
  </div>
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={
      "w-full rounded-xl bg-black text-white border border-white/30 px-4 py-3 outline-none " +
      (props.className ?? "")
    }
  />
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" }
> = ({ variant = "ghost", className = "", ...rest }) => {
  const base = "rounded-2xl px-6 py-4 font-semibold border";
  const style =
    variant === "solid"
      ? "bg-white text-black border-white"
      : "text-white border-white/40 hover:border-white/60";
  return <button {...rest} className={`${base} ${style} ${className}`} />;
};

export const Subtle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs text-white/60">{children}</div>
);
