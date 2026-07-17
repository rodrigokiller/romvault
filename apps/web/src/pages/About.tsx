import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Languages, Library, RefreshCw, Archive } from 'lucide-react';

/**
 * /sobre — a história e o diferencial do ROMVault, com crédito às fontes.
 * Importa pra confiança da cena (e pro beta fechado).
 */
export function About() {
  const { t } = useTranslation();
  const PILLARS = [
    { icon: Archive, title: t('about:p1t'), text: t('about:p1x') },
    { icon: Languages, title: t('about:p2t'), text: t('about:p2x') },
    { icon: Library, title: t('about:p3t'), text: t('about:p3x') },
    { icon: RefreshCw, title: t('about:p4t'), text: t('about:p4x') },
  ];
  const SOURCES = [
    ['romhacking.net (dump do Internet Archive)', 'https://archive.org/details/romhacking.net-20240801'],
    ['PO.B.R.E — romhackers.org', 'https://romhackers.org'],
    ['SMW Central', 'https://www.smwcentral.net'],
    ['IGDB', 'https://www.igdb.com'],
    ['MobyGames', 'https://www.mobygames.com'],
    ['libretro-thumbnails', 'https://github.com/libretro-thumbnails'],
    ['RetroAchievements', 'https://retroachievements.org'],
  ];

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('about:kicker')}</span>
        <h1>{t('about:title')}</h1>
        <p className="page-sub" style={{ maxWidth: '70ch' }}>{t('about:intro')}</p>
      </header>

      <section className="section">
        <div className="about-pillars">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="about-pillar">
                <Icon aria-hidden className="about-pillar-icon" />
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>{t('about:sourcesTitle')}</h2></div>
        <p className="page-sub" style={{ maxWidth: '70ch' }}>{t('about:sourcesText')}</p>
        <ul className="about-sources mono">
          {SOURCES.map(([label, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="section-link">{label}</a>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section-head"><h2>{t('about:rulesTitle')}</h2></div>
        <p className="page-sub" style={{ maxWidth: '70ch' }}>{t('about:rulesText')}</p>
        <p style={{ marginTop: 'var(--s4)' }}>
          <Link to="/games" className="section-link">{t('home:heroBrowse')} →</Link>
        </p>
      </section>
    </div>
  );
}
