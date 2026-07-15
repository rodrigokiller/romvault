import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { hasError, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={['input', hasError && 'has-error', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { hasError, className = '', ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={['textarea', hasError && 'has-error', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
});
