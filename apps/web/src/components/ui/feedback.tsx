import type { ComponentType, CSSProperties, ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s2)' }}>
      <span className="spinner" aria-hidden />
      {label && <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{label}</span>}
    </span>
  );
}

export function LoadingPage({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <Spinner label={label} />
    </div>
  );
}

export function Skeleton({
  w = '100%',
  h = 16,
  style,
}: {
  w?: number | string;
  h?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="skeleton"
      style={{
        display: 'block',
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
        ...style,
      }}
      aria-hidden
    />
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {Icon && <Icon className="empty-icon" />}
      <div className="empty-title">{title}</div>
      {text && <p className="empty-text">{text}</p>}
      {action && <div style={{ marginTop: 'var(--s2)' }}>{action}</div>}
    </div>
  );
}
