import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padSm?: boolean;
}

/** Painel quadrado. `interactive` adiciona hover para tiles clicáveis. */
export function Card({ interactive, padSm, className = '', ...rest }: CardProps) {
  const cls = ['card', interactive && 'card-interactive', padSm && 'card-pad-sm', className]
    .filter(Boolean)
    .join(' ');
  return <div className={cls} {...rest} />;
}
