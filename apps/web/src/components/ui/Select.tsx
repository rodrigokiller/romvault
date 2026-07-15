import { forwardRef, type SelectHTMLAttributes } from 'react';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { hasError, className = '', children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={['select', hasError && 'has-error', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </select>
  );
});
