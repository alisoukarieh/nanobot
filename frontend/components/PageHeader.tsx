"use client";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-primary)] flex-shrink-0">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[18px] sm:text-[19px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12.5px] text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
