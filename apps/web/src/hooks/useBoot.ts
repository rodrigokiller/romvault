import { useEffect, useRef, useState } from 'react';

/**
 * Segura a tela de abertura por um tempo MÍNIMO e libera quando os dados
 * chegam. Tempo fixo puro seria ruim dos dois lados: se o carregamento leva
 * 300ms o usuário esperaria à toa, e se leva 5s a tela sumiria antes da hora.
 */
export function useBoot(loading: boolean, minMs = 2400) {
  const [pronto, setPronto] = useState(false);
  const inicio = useRef(Date.now());
  useEffect(() => {
    if (loading) return undefined;
    const falta = Math.max(0, minMs - (Date.now() - inicio.current));
    const id = window.setTimeout(() => setPronto(true), falta);
    return () => window.clearTimeout(id);
  }, [loading, minMs]);
  return !pronto;
}
