import { useTranslation } from 'react-i18next';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

/** Barra A–Z. Clicar filtra pela letra inicial; letras sem jogos ficam apagadas. */
export function AlphabetBar({
  active,
  available,
  onPick,
}: {
  active: string | null;
  available?: Set<string>;
  onPick: (letter: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="alpha-bar" role="group" aria-label="A-Z">
      <button
        type="button"
        className={`alpha-btn alpha-all ${active == null ? 'is-active' : ''}`}
        onClick={() => onPick(null)}
      >
        {t('browse:filterAll')}
      </button>
      {LETTERS.map((l) => (
        <button
          key={l}
          type="button"
          className={`alpha-btn ${active === l ? 'is-active' : ''}`}
          disabled={available ? !available.has(l) : false}
          aria-pressed={active === l}
          onClick={() => onPick(active === l ? null : l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
