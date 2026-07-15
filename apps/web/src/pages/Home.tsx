import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Upload, TrendingUp, Newspaper, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { useStats, useTrending } from '@/hooks/useHome';
import { useArticles } from '@/hooks/useArticles';
import { KIND_META, type Kind } from '@/components/entities/kinds';

const STAT_KEYS = [
  { key: 'statGames', field: 'games' },
  { key: 'statRomhacks', field: 'romhacks' },
  { key: 'statTranslations', field: 'translations' },
  { key: 'statTools', field: 'tools' },
] as const;

const KIND_OF: Record<string, Kind> = {
  romhacks: 'romhack',
  translations: 'translation',
  documents: 'doc',
  tools: 'tool',
};

export function Home() {
  const { t } = useTranslation();
  const { data: stats } = useStats();
  const { data: trending = [], isLoading: trendingLoading } = useTrending(8);
  const { data: articles = [], isLoading: articlesLoading } = useArticles(3);

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <span className="kicker">{t('home:heroKicker')}</span>
          <h1>{t('home:heroTitle')}</h1>
          <p className="hero-sub">{t('home:heroSubtitle')}</p>

          <div className="hero-actions">
            <Link to="/games">
              <Button variant="primary">{t('home:heroBrowse')} <ArrowRight /></Button>
            </Link>
            <Link to="/submit">
              <Button variant="secondary"><Upload /> {t('home:heroSubmit')}</Button>
            </Link>
          </div>

          <div className="hero-stats">
            {STAT_KEYS.map(({ key, field }) => (
              <div className="hero-stat" key={key}>
                <span className="hero-stat-num">
                  {stats ? (stats[field] as number).toLocaleString() : '—'}
                </span>
                <span className="hero-stat-label">{t(`home:${key}`)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container">
        {/* Trending */}
        <section className="section">
          <div className="section-head">
            <div>
              <span className="kicker">{t('home:trendingKicker')}</span>
              <h2>{t('home:trendingTitle')}</h2>
            </div>
            <Link to="/romhacks" className="section-link">{t('common:viewAll')}</Link>
          </div>
          {trendingLoading ? (
            <div className="card-grid card-grid-tight">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} padSm><Skeleton h={72} /></Card>
              ))}
            </div>
          ) : trending.length === 0 ? (
            <EmptyState icon={TrendingUp} title={t('home:trendingTitle')} text={t('home:trendingEmpty')} />
          ) : (
            <div className="card-grid card-grid-tight">
              {trending.map((item) => {
                const kind = KIND_OF[item.kind];
                const meta = KIND_META[kind];
                const Icon = meta.icon;
                return (
                  <Link key={`${item.kind}-${item.id}`} to={item.to} style={{ display: 'block' }}>
                    <Card interactive padSm>
                      <div className="trend">
                        <div className="trend-icon"><Icon aria-hidden /></div>
                        <div className="trend-body">
                          <Badge tone={meta.tone}>{t(meta.kindKey)}</Badge>
                          <span className="trend-title">{item.title}</span>
                          <span className="tile-stat">
                            <Download aria-hidden /> {item.downloads.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Últimos artigos */}
        <section className="section">
          <div className="section-head">
            <div>
              <span className="kicker">{t('home:latestKicker')}</span>
              <h2>{t('home:latestTitle')}</h2>
            </div>
            <Link to="/articles" className="section-link">{t('common:viewAll')}</Link>
          </div>
          {articlesLoading ? (
            <div className="article-list">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} padSm><Skeleton h={48} /></Card>
              ))}
            </div>
          ) : articles.length === 0 ? (
            <EmptyState icon={Newspaper} title={t('home:latestTitle')} text={t('home:latestEmpty')} />
          ) : (
            <div className="article-list">
              {articles.map((a) => (
                <Link key={a.id} to={`/articles/${a.slug}`} className="article-row">
                  <div className="article-row-body">
                    {a.category && <Badge tone="accent">{a.category}</Badge>}
                    <h3>{a.title}</h3>
                    {a.excerpt && <p>{a.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
