import { useEffect, useState } from 'react';

/** Retorna `value` atrasado por `delay` ms — evita disparar busca a cada tecla. */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
