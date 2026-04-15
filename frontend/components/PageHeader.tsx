"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] flex-shrink-0">
      <div className="px-4 sm:px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 sm:gap-x-4 sm:gap-y-1.5">
        <div className="min-w-0 sm:flex-1 flex items-baseline gap-3 flex-wrap">
          <h1 className="text-[15px] sm:text-[16px] font-semibold text-[var(--text-primary)] tracking-[-0.01em] truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11.5px] text-[var(--text-tertiary)] truncate min-w-0">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap w-full sm:w-auto">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
