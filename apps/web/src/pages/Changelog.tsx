import { useTranslation } from 'react-i18next';
import { CHANGELOG } from '@/data/changelog';

/** /novidades: o que mudou no site, semana a semana (mostra que está vivo). */
export function Changelog() {
  const { t, i18n } = useTranslation();
  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('changelog:kicker')}</span>
        <h1>{t('changelog:title')}</h1>
        <p className="page-sub">{t('changelog:subtitle')}</p>
      </header>

      <div className="changelog">
        {CHANGELOG.map((entry) => (
          <section key={entry.date} className="changelog-entry">
            <div className="changelog-head">
              <span className="changelog-date mono">
                {new Date(`${entry.date}T12:00:00`).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <h2>{entry.title}</h2>
            </div>
            <ul className="changelog-items">
              {entry.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
