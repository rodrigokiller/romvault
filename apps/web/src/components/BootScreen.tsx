import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Tela de abertura do ROMVault (F5 e logo após o login).
 *
 * A marca É o produto: o glifo do site — um quadrado de terminal com o prompt
 * ">_" dentro — se DESENHA (o quadrado traça a borda, linha por linha) e então
 * o ">_" pisca, como um console ligando. A espera vira "o terminal bootando" em
 * vez de um círculo girando.
 *
 * Backup da versão anterior (chip de ROM se preenchendo) em
 * BootScreen.chip.bak.tsx — o Killer gostou dela e quis poder voltar.
 */
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
      {/* o próprio logo, em grande, se desenhando */}
      <svg className="boot-glyph" viewBox="0 0 32 32" width="104" height="104" aria-label={t('common:appName')}>
        <rect className="boot-sq" x="1.5" y="1.5" width="29" height="29" fill="none"
          stroke="var(--accent)" strokeWidth="2" />
        <path className="boot-prompt" d="M8 11 L12 16 L8 21" fill="none"
          stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="square" />
        <rect className="boot-prompt" x="15" y="19.8" width="9" height="2.4" fill="var(--accent)" />
      </svg>
      <span className="boot-word mono">ROMVAULT</span>
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
