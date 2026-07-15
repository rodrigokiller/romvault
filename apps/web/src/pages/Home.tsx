import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Upload, TrendingUp, Newspaper } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/feedback';

const STAT_KEYS = ['statGames', 'statRomhacks', 'statTranslations', 'statTools'] as const;

export function Home() {
  const { t } = useTranslation();

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <span className="kicker">{t('home:heroKicker')}</span>
          <h1>{t('home:heroTitle')}</h1>
          <p className="hero-sub">{t('home:heroSubtitle')}</p>

          <div className="hero-actions">
            <Link to="/games">
              <Button variant="primary">
                {t('home:heroBrowse')} <ArrowRight />
              </Button>
            </Link>
            <Link to="/submit">
              <Button variant="secondary">
                <Upload /> {t('home:heroSubmit')}
              </Button>
            </Link>
          </div>

          <div className="hero-stats">
            {STAT_KEYS.map((k) => (
              <div className="hero-stat" key={k}>
                <span className="hero-stat-num">—</span>
                <span className="hero-stat-label">{t(`home:${k}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section">
          <div className="section-head">
            <div>
              <span className="kicker">{t('home:trendingKicker')}</span>
              <h2>{t('home:trendingTitle')}</h2>
            </div>
            <Link to="/games" className="section-link">
              {t('common:viewAll')}
            </Link>
          </div>
          <EmptyState icon={TrendingUp} title={t('home:trendingTitle')} text={t('home:trendingEmpty')} />
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <span className="kicker">{t('home:latestKicker')}</span>
              <h2>{t('home:latestTitle')}</h2>
            </div>
            <Link to="/articles" className="section-link">
              {t('common:viewAll')}
            </Link>
          </div>
          <EmptyState icon={Newspaper} title={t('home:latestTitle')} text={t('home:latestEmpty')} />
        </section>
      </div>
    </>
  );
}
