"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  code?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, code, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] flex-shrink-0">
      <div className="px-4 sm:px-6 min-h-14 py-2 flex items-center gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 flex items-baseline gap-3 flex-wrap">
          {code && (
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-[var(--text-tertiary)] uppercase">
              {code}
            </span>
          )}
          <h1 className="text-[13px] font-semibold text-[var(--text-primary)] tracking-[0.15em] uppercase truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden sm:block text-[11px] text-[var(--text-tertiary)] truncate min-w-0">— {subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
