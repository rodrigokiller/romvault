import { useId, type ReactNode } from 'react';

interface Props {
  label: string;
  error?: string;
  hint?: string;
  children: (id: string) => ReactNode;
}

/**
 * Envelope de campo de formulário: rótulo, dica e erro consistentes.
 * O `children` recebe o id para amarrar <label> ao controle (a11y).
 */
export function Field({ label, error, hint, children }: Props) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-row">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {hint && !error && <span className="field-hint">{hint}</span>}
      </div>
      {children(id)}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
