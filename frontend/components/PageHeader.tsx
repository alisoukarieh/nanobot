"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] flex-shrink-0">
      <div className="px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0 flex-1 flex items-baseline gap-3 flex-wrap">
          <h1 className="text-[15px] sm:text-[16px] font-semibold text-[var(--text-primary)] tracking-[-0.01em] truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11.5px] text-[var(--text-tertiary)] truncate min-w-0">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
