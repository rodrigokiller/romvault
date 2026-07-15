import type { HTMLAttributes } from 'react';

/** Categorias de material têm cor própria (ver DESIGN.md). */
export type BadgeTone = 'default' | 'accent' | 'romhack' | 'translation' | 'doc' | 'tool';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'default', className = '', ...rest }: Props) {
  const cls = ['badge', tone !== 'default' && `badge-${tone}`, className]
    .filter(Boolean)
    .join(' ');
  return <span className={cls} {...rest} />;
}
