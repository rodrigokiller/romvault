import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Tela de abertura do ROMVault (F5 e logo após o login).
 *
 * A ideia é a mesma do Jhourney: a espera mostra o PRODUTO em vez de um círculo
 * girando. Aqui a marca é um chip de ROM — os blocos de memória vão sendo
 * preenchidos, que é literalmente o que o site faz (carregar o acervo). Depois
 * o nome aparece, em monoespaçado, como um terminal.
 *
 * As etapas existem porque a espera tem causa: verificar a sessão e carregar o
 * catálogo são duas idas ao servidor. Dizer em qual delas está transforma
 * "travou" em "está fazendo algo".
 */

/* 4x4: a ordem de preenchimento é em diagonal, fica mais orgânico que linha a linha */
const BLOCOS = Array.from({ length: 16 }, (_, i) => i);
const atraso = (i: number) => ((i % 4) + Math.floor(i / 4)) * 90;

export function BootScreen({ minMs = 2400 }: { minMs?: number }) {
  const { t } = useTranslation();
  const [etapa, setEtapa] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduzir) { setEtapa(2); return undefined; }
    // marcas de progresso: a espera real costuma ser curta, isto só evita que
    // pareça parada quando o servidor demora
    [Math.round(minMs * 0.3), Math.round(minMs * 0.7)].forEach((ms, i) => {
      timers.current.push(window.setTimeout(() => setEtapa((n) => Math.max(n, i + 1)), ms));
    });
    return () => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [minMs]);

  const ETAPAS = [t('common:bootSession'), t('common:bootCatalog'), t('common:bootReady')];

  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-mark" aria-hidden>
        {BLOCOS.map((i) => (
          <span key={i} className="boot-bit" style={{ animationDelay: `${atraso(i)}ms` }} />
        ))}
      </div>
      <span className="boot-word mono">ROMVAULT<span className="boot-caret" aria-hidden /></span>
      <ul className="boot-steps">
        {ETAPAS.map((texto, i) => (
          <li key={texto} className={`boot-step${i <= etapa ? ' is-on' : ''}`}>
            <span className="boot-dot" aria-hidden />
            <span className="mono">{texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
