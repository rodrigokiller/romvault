import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Upload, TrendingUp, Newspaper, Download, Layers, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useMyAccounts } from '@/hooks/useAccounts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { useStats, useTrending } from '@/hooks/useHome';
import { useArticles } from '@/hooks/useArticles';
import { useCollections } from '@/hooks/useCollections';
import { useGamesPage } from '@/hooks/useGames';
import { useMyProfile } from '@/hooks/useProfile';
import { useHomeShelf, useLibraryCount } from '@/hooks/useTracks';
import { useTranslationLangs, uiLangCode } from '@/hooks/useTranslationLangs';
import { GameCard } from '@/components/entities/GameCard';
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
  const { data: collections = [] } = useCollections(3);
  // 6 lançamentos mais recentes (só o que JÁ saiu — mesmo filtro do Explorar)
  const { data: recent } = useGamesPage({ sort: 'newest', release: 'released' }, 0, 6);

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
        <OnboardingCard />
        <MyShelfStrip />

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

        {/* Lançamentos recentes */}
        {(recent?.games.length ?? 0) > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <span className="kicker">{t('home:recentKicker')}</span>
                <h2>{t('home:recentTitle')}</h2>
              </div>
              <Link to="/games" className="section-link">{t('common:viewAll')}</Link>
            </div>
            <div className="card-grid card-grid-cover">
              {recent!.games.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        )}

        {/* Coleções curadas */}
        {collections.length > 0 && (
          <section className="section">
            <div className="section-head">
              <div>
                <span className="kicker">{t('collections:homeKicker')}</span>
                <h2>{t('collections:title')}</h2>
              </div>
              <Link to="/collections" className="section-link">{t('common:viewAll')}</Link>
            </div>
            <div className="collection-grid">
              {collections.map((col) => (
                <Link key={col.id} to={`/collections/${col.slug}`} className="collection-card">
                  <div className="collection-cover">
                    {col.cover_url ? <img src={col.cover_url} alt="" loading="lazy" /> : <Layers aria-hidden />}
                  </div>
                  <div className="collection-body">
                    <h3>{col.title}</h3>
                    {col.description && <p>{col.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

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

/**
 * Faixa pessoal da home (logado): "jogando agora" + backlog jogável no seu
 * idioma — o tracker como asa de primeira classe, não um anexo do perfil.
 */
function MyShelfStrip() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMyProfile();
  // query MAGRA e limitada (não a biblioteca inteira com metadata embutida)
  const { data: tracks = [] } = useHomeShelf(me?.id ?? undefined);
  const gameIds = useMemo(() => tracks.map((x) => x.game_id), [tracks]);
  const { data: langsByGame } = useTranslationLangs(gameIds);
  if (!me?.username || tracks.length === 0) return null;

  const uiCode = uiLangCode(i18n.language || 'pt-BR');
  const playing = tracks.filter((x) => x.status === 'playing').slice(0, 6);
  const playableBacklog = tracks.filter(
    (x) => x.status === 'backlog' && (langsByGame?.get(x.game_id) ?? []).includes(uiCode),
  );

  return (
    <section className="section my-strip">
      <div className="section-head">
        <h2>{t('home:myShelfTitle')}</h2>
        <Link to={`/u/${me.username}/library`} className="section-link">
          {t('library:viewLibrary')} <ArrowRight aria-hidden style={{ width: 14, height: 14, verticalAlign: '-2px' }} />
        </Link>
      </div>
      <div className="my-strip-body">
        {playing.length > 0 && (
          <div className="my-strip-group">
            <span className="my-strip-label mono">// {t('home:myPlaying').toLowerCase()}</span>
            <div className="my-strip-covers">
              {playing.map((x) => (
                <Link key={x.game_id} to={`/games/${x.game.slug}`} title={x.game.title}>
                  {x.game.cover_url || x.game.thumbnail
                    ? <img src={x.game.cover_url ?? x.game.thumbnail ?? ''} alt={x.game.title} loading="lazy" />
                    : <span className="my-strip-fallback">{x.game.title}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
        {playableBacklog.length > 0 && (
          <div className="my-strip-group">
            <span className="my-strip-label mono">
              // {t('home:myPlayable', { lang: uiCode, count: playableBacklog.length }).toLowerCase()}
            </span>
            <div className="my-strip-covers">
              {playableBacklog.slice(0, 6).map((x) => (
                <Link key={x.game_id} to={`/games/${x.game.slug}`} title={x.game.title}>
                  {x.game.cover_url || x.game.thumbnail
                    ? <img src={x.game.cover_url ?? x.game.thumbnail ?? ''} alt={x.game.title} loading="lazy" />
                    : <span className="my-strip-fallback">{x.game.title}</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Onboarding do primeiro login (momento-mágico do PlayTracker): biblioteca
 * vazia + nenhuma conta vinculada -> convite pra vincular Steam/RA/PSN/Xbox/
 * GOG e nascer com a biblioteca cheia. Dispensável (localStorage).
 */
function OnboardingCard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { data: me } = useMyProfile();
  // head-count barato: não paga a biblioteca inteira pra saber se está vazia
  const { data: trackCount = 0 } = useLibraryCount(me?.id ?? undefined);
  const { data: accounts = [] } = useMyAccounts();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('rv:onboarded') === '1');

  if (!session || dismissed || trackCount > 0 || accounts.length > 0) return null;

  function dismiss() {
    localStorage.setItem('rv:onboarded', '1');
    setDismissed(true);
  }

  return (
    <section className="onboard">
      <div className="onboard-body">
        <span className="kicker">// {t('onboard:kicker')}</span>
        <h2>{t('onboard:title')}</h2>
        <p className="page-sub">{t('onboard:text')}</p>
        <div className="onboard-actions">
          <Link to="/settings"><Button variant="primary"><LinkIcon /> {t('onboard:cta')}</Button></Link>
          <Link to="/games"><Button variant="secondary">{t('onboard:browse')}</Button></Link>
          <Button variant="ghost" onClick={dismiss}>{t('onboard:skip')}</Button>
        </div>
        <span className="onboard-providers mono">Steam · RetroAchievements · PlayStation · Xbox · GOG</span>
      </div>
    </section>
  );
}
