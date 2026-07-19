import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Gamepad2, Languages as LanguagesIcon } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { useGame, useRelatedGames } from '@/hooks/useGames';
import { useGameRomhacks, useGameTranslations, useGameDocuments } from '@/hooks/useMaterials';
import { MaterialCard } from '@/components/entities/MaterialCard';
import { GameCard } from '@/components/entities/GameCard';
import { Reviews } from '@/components/entities/Reviews';
import { FavoriteButton } from '@/components/entities/FavoriteButton';
import { ShareButton } from '@/components/entities/ShareButton';
import { TrackButton } from '@/components/entities/TrackButton';
import { CopiesWidget } from '@/components/entities/CopiesWidget';
import { PlaythroughsWidget, type PatchOption } from '@/components/entities/PlaythroughsWidget';
import { ScreenshotGrid } from '@/components/entities/ScreenshotGrid';
import { BoxScans } from '@/components/entities/BoxScans';
import { AdminItemTools } from '@/components/entities/AdminItemTools';
import { ReportButton } from '@/components/entities/ReportButton';
import { PrivacyToggle } from '@/components/entities/PrivacyToggle';
import { SyncDataPanel } from '@/components/entities/SyncDataPanel';
import { langCode, uiLangCode } from '@/hooks/useTranslationLangs';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import type { Kind } from '@/components/entities/kinds';

/** Há algum scan físico em metadata (moby/boxart/box3d)? */
function hasScans(metadata: unknown): boolean {
  const m = (metadata ?? {}) as { boxart?: string; box3d?: string; moby?: { front?: string } };
  return Boolean(m.boxart || m.box3d || m.moby?.front);
}

/**
 * Deep-link jogador->patch: "Jogar em português" leva direto à MELHOR
 * tradução no idioma da UI (por ora: mais baixada; quando a base de zeradas
 * com patch crescer, o ranking da cena assume).
 */
function PlayInMyLang({ translations }: { translations: Record<string, unknown>[] }) {
  const { t, i18n } = useTranslation();
  const ui = uiLangCode(i18n.language || 'pt-BR');
  const mine = translations
    .filter((tr) => tr.language && langCode(String(tr.language)) === ui)
    .sort((a, b) => (Number(b.downloads) || 0) - (Number(a.downloads) || 0));
  if (mine.length === 0) return null;
  return (
    <Link to={`/translations/${String(mine[0].id)}`}>
      <Button variant="primary">
        <LanguagesIcon /> {t('games:playInLang', { lang: ui })}
      </Button>
    </Link>
  );
}

function humanize(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Slug no padrão do IGDB (nome slugificado) pro link do selo de origem. */
function slugifyTitle(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’"]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

/** Títulos alternativos: coluna nova alt_titles, com metadata como fallback. */
function altTitlesOf(game: ReturnType<typeof useGame>['data']): string[] {
  const col = (game as (typeof game & { alt_titles?: string[] }) | undefined)?.alt_titles;
  const meta = ((game?.metadata ?? {}) as { alt_titles?: string[] }).alt_titles;
  const list = (col?.length ? col : meta) ?? [];
  return [...new Set(list.filter((a) => a && a !== game?.alt_title))];
}

type Row = Record<string, unknown>;

export function GameDetail() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: game, isLoading } = useGame(slug);
  const [tab, setTab] = useState('overview');

  const gameId = game?.id;
  const romhacks = useGameRomhacks(gameId);
  const translations = useGameTranslations(gameId);
  const documents = useGameDocuments(gameId);
  const related = useRelatedGames(game);

  const rc = romhacks.data?.length ?? 0;
  const tc = translations.data?.length ?? 0;
  const dc = documents.data?.length ?? 0;

  // a PONTE hub<->tracker: traduções/hacks deste jogo viram opções de
  // "jogou com"/"patcheada com" nas zeradas e cópias
  const patchOptions: PatchOption[] = [
    ...((translations.data ?? []) as Row[]).map((tr) => ({
      kind: 'translation' as const,
      id: String(tr.id),
      label: String(tr.language ?? tr.title ?? ''),
    })),
    ...((romhacks.data ?? []) as Row[]).map((rh) => ({
      kind: 'romhack' as const,
      id: String(rh.id),
      label: String(rh.title ?? ''),
    })),
  ].filter((o) => o.label);

  const withCount = (label: string, n: number) => (n ? `${label} (${n})` : label);

  const tabs: TabItem[] = [
    { id: 'overview', label: t('games:tabOverview') },
    { id: 'images', label: t('games:tabImages') },
    { id: 'releases', label: t('games:tabReleases') },
    { id: 'translations', label: withCount(t('games:tabTranslations'), tc) },
    { id: 'romhacks', label: withCount(t('games:tabRomhacks'), rc) },
    { id: 'docs', label: withCount(t('games:tabDocs'), dc) },
  ];

  if (isLoading) return <LoadingPage />;

  const title = game?.title ?? humanize(slug ?? 'jogo');
  const screenshots = (game?.screenshots ?? []).filter(Boolean);
  const completion = game?.completion_times as Record<string, string> | null | undefined;

  const heroImg = game?.screenshots?.[0] ?? game?.cover_url ?? null;

  return (
    <div className="container">
      <div
        className={`detail-head ${heroImg ? 'detail-hero' : ''}`}
        style={heroImg ? ({ '--hero-img': `url("${heroImg}")` } as React.CSSProperties) : undefined}
      >
        {game && (
          <div className="detail-report">
            {game.igdb_id ? (
              // o slug do IGDB = nome slugificado na esmagadora maioria
              <a
                className="origin-badge mono"
                href={`https://www.igdb.com/games/${slugifyTitle(game.title)}`}
                target="_blank" rel="noopener noreferrer"
                title={t('entities:originIgdbHint')}
              >
                IGDB #{game.igdb_id}
              </a>
            ) : game.data_source && game.data_source !== 'manual' ? (
              <span className="origin-badge mono" title={t('entities:originHint')}>{game.data_source}</span>
            ) : null}
            <ReportButton subjectType="game" subjectId={game.id} subjectLabel={title} />
          </div>
        )}
        <div className="detail-side">
          <div className="detail-cover">
            {game?.cover_url ? (
              <img src={game.cover_url} alt={title} />
            ) : (
              <Gamepad2 aria-hidden />
            )}
          </div>
          {game && <GameSideStats game={game} completion={completion} />}
        </div>
        <div className="detail-info">
          <span className="kicker">
            // {t('entities:kindGame')}
            {(game as (typeof game & { game_type?: string | null }) | undefined)?.game_type &&
              (game as typeof game & { game_type?: string | null }).game_type !== 'main' && (
              <span className="type-chip mono">
                {t(`games:type_${(game as typeof game & { game_type?: string }).game_type}`)}
              </span>
            )}
          </span>
          <h1>{title}</h1>
          {game?.alt_title && <p className="muted-text">{game.alt_title}</p>}
          {game?.description && <p className="page-sub">{game.description}</p>}
          <dl className="meta-grid">
            {/* estilo IGDB: main developers (plural) + publishers */}
            <MetaItem
              label={t('games:developers')}
              value={((game as (typeof game & { developers?: string[] }) | undefined)?.developers?.length
                ? (game as typeof game & { developers?: string[] }).developers!.join(', ')
                : game?.developer) ?? null}
            />
            <MetaItem label={t('games:publisher')} value={game?.publishers?.join(', ')} />
            <MetaItem label={t('games:released')} value={game?.release_date} />
            {(() => {
              const serie = (game as (typeof game & { series?: string | null }) | undefined)?.series ?? game?.franchise;
              return serie ? (
                <div className="meta-item">
                  <dt>{t('games:franchise')}</dt>
                  <dd>
                    <Link to={`/series/${encodeURIComponent(serie)}`} className="section-link">{serie}</Link>
                  </dd>
                </div>
              ) : null;
            })()}
            <MetaItem label={t('games:genres')} value={game?.genres?.join(', ')} />
            <MetaItem label={t('games:ageRating')} value={game?.age_rating} />
            {/* "também conhecido como" abaixo do título, no estilo dos demais
                campos (era só na aba Releases) — só aparece quando existe */}
            {(() => {
              const alts = altTitlesOf(game);
              return alts.length > 0 ? (
                <MetaItem label={t('games:altTitles')} value={alts.join(' · ')} />
              ) : null;
            })()}
          </dl>
          {game?.platforms && game.platforms.length > 0 && (
            <div className="tile-badges" style={{ marginTop: 'var(--s4)' }}>
              {/* plataformas CLICÁVEIS -> página da plataforma (design igual) */}
              {game.platforms.map((p) => (
                <Link key={p} to={`/platform/${encodeURIComponent(p)}`} className="badge-link">
                  <Badge tone="accent">{p}</Badge>
                </Link>
              ))}
            </div>
          )}
          <LangsRow
            uiCode={uiLangCode(i18n.language || 'pt-BR')}
            patchCodes={[...new Set((translations.data ?? [])
              .map((tr) => tr.language && langCode(tr.language))
              .filter(Boolean) as string[])]}
            officialCodes={((game?.metadata as unknown as { official_langs?: string[] } | null)?.official_langs) ?? []}
          />
          {game && (
            <div className="detail-actions">
              <PlayInMyLang translations={(translations.data ?? []) as Row[]} />
              <TrackButton gameId={game.id} />
              <PrivacyToggle gameId={game.id} />
              <FavoriteButton subjectType="game" subjectId={game.id} />
              <ShareButton title={title} />
            </div>
          )}
          {game && <SyncDataPanel gameId={game.id} />}
          {game && <CopiesWidget gameId={game.id} platforms={game.platforms ?? []} patchOptions={patchOptions} />}
          {game && <PlaythroughsWidget gameId={game.id} patchOptions={patchOptions} />}
          {game && (
            <AdminItemTools
              gameId={game.id}
              gameTitle={game.title}
              dataSource={game.data_source}
              updatedAt={(game as unknown as { updated_at?: string }).updated_at ?? null}
              igdbId={game.igdb_id}
            />
          )}
        </div>
      </div>

      <Highlights romhacks={romhacks.data} translations={translations.data} />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="tab-panel" role="tabpanel">
        {tab === 'overview' && (
          <OverviewTab game={game} completion={completion} />
        )}

        {tab === 'images' && (
          <>
            <BoxScans metadata={game?.metadata} />
            {game && <GameMediaGroups gameId={game.id} />}
            {screenshots.length > 0 ? (
              <ScreenshotGrid images={screenshots} />
            ) : (
              !hasScans(game?.metadata) && <EmptyState title={t('games:tabImages')} text={t('common:comingSoonText')} />
            )}
          </>
        )}

        {tab === 'releases' && <ReleasesTab game={game} />}

        {tab === 'translations' && <RelatedGrid kind="translation" query={translations} />}
        {tab === 'romhacks' && <RelatedGrid kind="romhack" query={romhacks} />}
        {tab === 'docs' && <RelatedGrid kind="doc" query={documents} />}
      </div>

      {game && <VersionsSection gameId={game.id} />}

      {game && (related.data?.length ?? 0) > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('games:related')}</h2></div>
          <div className="card-grid card-grid-cover">
            {related.data!.map((r) => (
              <GameCard key={r.id} game={r} />
            ))}
          </div>
        </section>
      )}

      {game && <Reviews subjectType="game" subjectId={game.id} />}
    </div>
  );
}

interface GameMeta {
  scores?: {
    critics?: number | null; critics_count?: number | null;
    users?: number | null; users_count?: number | null;
    metacritic?: { score: number; url?: string } | null;
  };
  releases?: { platform: string; date: string; region?: string | null }[];
  alt_titles?: string[];
}

/**
 * Coluna sob a capa (aproveita o espaço vazio): notas (críticos agregados do
 * IGDB + usuários + nota da casa via reviews), contadores da comunidade
 * (têm/jogando/zeraram) e HLTB compacto quando existir.
 */
function GameSideStats({ game, completion }: {
  game: NonNullable<ReturnType<typeof useGame>['data']>;
  completion?: Record<string, string> | null;
}) {
  const { t } = useTranslation();
  const { data: community } = useGameCommunity(game.id);
  const meta = (game.metadata ?? {}) as GameMeta;
  const scores = meta.scores;
  const hasScores = Boolean(scores?.critics || scores?.users || scores?.metacritic?.score || community?.review_avg);
  const hasCommunity = Boolean(community && community.owners > 0);
  const hltb = [
    { label: t('games:completionMain'), value: completion?.main_story },
    { label: t('games:completionExtras'), value: completion?.main_extras },
    { label: t('games:completionFull'), value: completion?.completionist },
  ].filter((x) => x.value);
  if (!hasScores && !hasCommunity && hltb.length === 0) return null;
  return (
    <div className="side-stats">
      {hasScores && (
        <div className="side-card">
          <span className="side-card-label mono">// {t('games:scoresTitle')}</span>
          {scores?.metacritic?.score ? (
            <div className="side-score">
              {/* caixinha de nota estilo Metacritic (verde/amarelo/vermelho) */}
              <span className={`mc-box ${scores.metacritic.score >= 75 ? 'mc-good' : scores.metacritic.score >= 50 ? 'mc-mid' : 'mc-bad'}`}>
                {scores.metacritic.score}
              </span>
              <span className="side-score-what">
                {scores.metacritic.url
                  ? <a href={scores.metacritic.url} target="_blank" rel="noopener noreferrer">Metacritic</a>
                  : 'Metacritic'}
              </span>
            </div>
          ) : null}
          {scores?.critics ? (
            <div className="side-score">
              <span className="side-score-num">{scores.critics}</span>
              <span className="side-score-what">{t('games:scoreCritics', { count: scores.critics_count ?? 0 })} <span className="source-badge source-badge-sm mono">IGDB</span></span>
            </div>
          ) : null}
          {scores?.users ? (
            <div className="side-score">
              <span className="side-score-num">{scores.users}</span>
              <span className="side-score-what">{t('games:scoreUsers', { count: scores.users_count ?? 0 })}</span>
            </div>
          ) : null}
          {community?.review_avg ? (
            <div className="side-score">
              <span className="side-score-num side-score-ours">{community.review_avg}</span>
              <span className="side-score-what">{t('games:scoreOurs', { count: community.review_n })}</span>
            </div>
          ) : null}
        </div>
      )}
      {hasCommunity && community && (
        <div className="side-card">
          <span className="side-card-label mono">// {t('games:communityTitle')}</span>
          <div className="side-row"><span>{t('games:communityOwners')}</span><span className="mono">{community.owners}</span></div>
          {community.playing > 0 && (
            <div className="side-row"><span>{t('games:communityPlaying')}</span><span className="mono">{community.playing}</span></div>
          )}
          {community.finished > 0 && (
            <div className="side-row"><span>{t('games:communityFinished')}</span><span className="mono">{community.finished}</span></div>
          )}
        </div>
      )}
      {hltb.length > 0 && (
        <div className="side-card">
          <span className="side-card-label mono">// {t('games:completionTitle')}</span>
          {hltb.map((x) => (
            <div key={x.label} className="side-row"><span>{x.label}</span><span className="mono">{x.value}</span></div>
          ))}
          {/* de onde vieram os tempos: HowLongToBeat ou IGDB (fallback) */}
          {completion?.source && (
            <span className="source-badge mono" data-src={completion.source}>{completion.source}</span>
          )}
        </div>
      )}
      {game.age_rating && (
        <div className="side-card">
          <span className="side-card-label mono">// {t('games:ageRating')}</span>
          <div className="side-row"><span className="mono" style={{ color: 'var(--ink-bright)' }}>{game.age_rating}</span></div>
        </div>
      )}
    </div>
  );
}

interface VersionRow {
  game: { id: string; slug: string; title: string; cover_url: string | null; thumbnail: string | null; platforms: string[] | null };
  relation: string;
  /** true = o OUTRO jogo é o derivado (remaster/porte DESTE); false = o outro é o original. */
  otherIsDerived: boolean;
}

/**
 * Versões ligadas (game_relations): Chrono Trigger SNES x PS1 x NDS são jogos
 * SEPARADOS mas conectados — remaster/remake/port/expanded nunca são fundidos.
 */
function useGameVersions(gameId: string | undefined) {
  return useQuery({
    queryKey: ['gameVersions', gameId],
    enabled: Boolean(gameId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VersionRow[]> => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data, error } = await sb.from('game_relations')
        .select('game_id, related_id, relation')
        .or(`game_id.eq.${gameId},related_id.eq.${gameId}`);
      if (error) return []; // tabela ainda não migrada: seção só não aparece
      const rows = (data ?? []) as { game_id: string; related_id: string; relation: string }[];
      if (rows.length === 0) return [];
      const otherIds = [...new Set(rows.map((r) => (r.game_id === gameId ? r.related_id : r.game_id)))];
      const { data: gs } = await sb.from('games')
        .select('id, slug, title, cover_url, thumbnail, platforms').in('id', otherIds);
      const gameOf = new Map((gs ?? []).map((g) => [g.id as string, g]));
      return rows
        .map((r) => {
          const otherId = r.game_id === gameId ? r.related_id : r.game_id;
          const other = gameOf.get(otherId);
          if (!other) return null;
          return {
            game: other as VersionRow['game'],
            relation: r.relation,
            otherIsDerived: r.game_id === otherId,
          };
        })
        .filter(Boolean) as VersionRow[];
    },
  });
}

/** Seção "Versões e relacionados": as outras edições do mesmo jogo. */
function VersionsSection({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const { data: versions = [] } = useGameVersions(gameId);
  if (versions.length === 0) return null;
  const typeOf = (v: VersionRow) =>
    v.otherIsDerived ? t(`games:type_${v.relation.replace(/_of$/, '')}`) : t('games:relBase');
  return (
    <section className="section">
      <div className="section-head"><h2>{t('games:versionsTitle')}</h2></div>
      <div className="versions-row">
        {versions.map((v) => (
          <Link key={v.game.id} to={`/games/${v.game.slug}`} className="version-card" title={v.game.title}>
            <span className="version-cover">
              {v.game.cover_url || v.game.thumbnail
                ? <img src={v.game.cover_url ?? v.game.thumbnail ?? ''} alt={v.game.title} loading="lazy" />
                : <Gamepad2 aria-hidden />}
            </span>
            <span className="version-body">
              <span className="type-chip mono">{typeOf(v)}</span>
              <span className="version-title">{v.game.title}</span>
              <span className="version-plats mono">{(v.game.platforms ?? []).slice(0, 3).join(' · ')}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Grupos de mídia (game_media): capas por REGIÃO e artes (heroes) do IGDB —
 * separados por grupo, como no site deles (pedido do analise.txt).
 */
function GameMediaGroups({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const { data: media = [] } = useQuery({
    queryKey: ['gameMedia', gameId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ kind: string; region: string | null; url: string; source: string }[]> => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data, error } = await sb.from('game_media')
        .select('kind, region, url, source')
        .eq('game_id', gameId)
        .order('kind');
      if (error) return []; // tabela ainda não migrada: seção só não aparece
      return (data ?? []) as { kind: string; region: string | null; url: string; source: string }[];
    },
  });
  const covers = media.filter((m) => m.kind === 'cover');
  const heroes = media.filter((m) => m.kind === 'hero');
  if (covers.length === 0 && heroes.length === 0) return null;
  return (
    <>
      {covers.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('games:mediaCoversTitle')}</h2></div>
          <div className="media-covers">
            {covers.map((m) => (
              <figure key={m.url} className="media-cover">
                <img src={m.url} alt={m.region ?? ''} loading="lazy" />
                {m.region && <figcaption className="type-chip mono">{m.region}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}
      {heroes.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>{t('games:mediaHeroesTitle')}</h2></div>
          <ScreenshotGrid images={heroes.map((m) => m.url)} />
        </section>
      )}
    </>
  );
}

/** Contadores agregados da comunidade (RPC; some em silêncio se não migrado). */
function useGameCommunity(gameId: string) {
  return useQuery({
    queryKey: ['gameCommunity', gameId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ owners: number; playing: number; finished: number; review_avg: number | null; review_n: number } | null> => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data, error } = await sb.rpc('game_community_stats', { gid: gameId });
      if (error) return null;
      const row = (Array.isArray(data) ? data[0] : data) as
        { owners: number; playing: number; finished: number; review_avg: number | null; review_n: number } | undefined;
      return row ?? null;
    },
  });
}

/** Aba Releases: datas POR PLATAFORMA (metadata.releases do IGDB) + títulos. */
function ReleasesTab({ game }: { game: ReturnType<typeof useGame>['data'] }) {
  const { t } = useTranslation();
  const meta = (game?.metadata ?? {}) as GameMeta;
  // dedupe no display: só mantém linha duplicada quando a REGIÃO difere (o
  // que dava "WII 2011-05-20" repetido eram entradas sem região distinta)
  const seen = new Set<string>();
  const releases = (meta.releases ?? []).filter((r) => {
    const k = `${r.platform}|${r.date}|${r.region ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <div>
      {releases.length > 0 ? (
        <div className="releases-list">
          {releases.map((r, i) => (
            <div key={`${r.platform}-${r.date}-${r.region ?? ''}-${i}`} className="releases-row">
              <span className="releases-plat">
                <Badge tone="accent">{r.platform}</Badge>
                {/* país junto: fica menos estranho quando há linhas por região */}
                {r.region && <span className="type-chip mono">{r.region}</span>}
              </span>
              <span className="releases-date mono">{r.date}</span>
            </div>
          ))}
        </div>
      ) : (
        <dl className="meta-grid">
          <MetaItem label={t('games:released')} value={game?.release_date} />
          <MetaItem label={t('games:platforms')} value={game?.platforms?.join(', ')} />
        </dl>
      )}
      {game?.regional_titles && (
        <dl className="meta-grid" style={{ marginTop: 'var(--s4)' }}>
          {Object.entries(game.regional_titles as Record<string, string>).map(([region, name]) => (
            <MetaItem key={region} label={region} value={name} />
          ))}
        </dl>
      )}
    </div>
  );
}

/** Idiomas do jogo: TRADUÇÕES DE FÃS (patch) vs OFICIAIS, em bloco próprio. */
function LangsRow({ uiCode, patchCodes, officialCodes }: { uiCode: string; patchCodes: string[]; officialCodes: string[] }) {
  const { t } = useTranslation();
  const sortUi = (arr: string[]) =>
    [...new Set(arr)].sort((a, b) => (a === uiCode ? -1 : b === uiCode ? 1 : a.localeCompare(b)));
  const patch = sortUi(patchCodes);
  const official = sortUi(officialCodes);
  if (patch.length === 0 && official.length === 0) return null;
  return (
    <div className="langs-row">
      {patch.length > 0 && (
        <div className="langs-group">
          <span className="langs-label">{t('games:langsPatch')}</span>
          {patch.map((code) => (
            <span key={code} className={`lang-chip ${code === uiCode ? 'is-ui' : ''}`}>{code}</span>
          ))}
        </div>
      )}
      {official.length > 0 && (
        <div className="langs-group">
          <span className="langs-label">{t('games:langsOfficial')}</span>
          {official.map((code) => (
            <span key={code} className="lang-chip lang-chip-official">{code}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Em destaque": os hacks/traduções mais baixados DESTE jogo, acima das abas. */
function Highlights({
  romhacks,
  translations,
}: {
  romhacks?: unknown[];
  translations?: unknown[];
}) {
  const { t } = useTranslation();
  const top = [
    ...((romhacks ?? []) as Row[]).map((item) => ({ kind: 'romhack' as Kind, item })),
    ...((translations ?? []) as Row[]).map((item) => ({ kind: 'translation' as Kind, item })),
  ]
    .filter((x) => Number(x.item.downloads) > 0)
    .sort((a, b) => Number(b.item.downloads) - Number(a.item.downloads))
    .slice(0, 3);
  if (top.length === 0) return null;
  return (
    <section style={{ marginBottom: 'var(--s5)' }}>
      <div className="section-head">
        <div>
          <span className="kicker">{t('games:highlightsKicker')}</span>
          <h2>{t('games:highlightsTitle')}</h2>
        </div>
      </div>
      <div className="card-grid">
        {top.map(({ kind, item }) => (
          <MaterialCard key={`${kind}-${String(item.id)}`} kind={kind} item={item} />
        ))}
      </div>
    </section>
  );
}

function OverviewTab({
  game,
  completion,
}: {
  game: ReturnType<typeof useGame>['data'];
  completion?: Record<string, string> | null;
}) {
  const { t } = useTranslation();
  const features = (game?.features ?? []).concat(game?.themes ?? []).filter(Boolean);
  return (
    <div>
      {game?.description ? (
        <div className="prose"><p>{game.description}</p></div>
      ) : (
        <EmptyState title={t('common:comingSoonTitle')} text={t('common:comingSoonText')} />
      )}

      {features.length > 0 && (
        <div className="tile-badges" style={{ marginTop: 'var(--s5)' }}>
          {features.map((f) => (
            <span key={f} className="chip">{f}</span>
          ))}
        </div>
      )}

      {completion && (completion.main_story || completion.completionist) && (
        <div className="completion" style={{ marginTop: 'var(--s6)' }}>
          <h3 className="completion-title">{t('games:completionTitle')}</h3>
          <div className="completion-grid">
            <CompletionCell label={t('games:completionMain')} value={completion.main_story} />
            <CompletionCell label={t('games:completionExtras')} value={completion.main_extras} />
            <CompletionCell label={t('games:completionFull')} value={completion.completionist} />
          </div>
          {completion.source && <p className="muted-text completion-source">{t('games:completionSource', { source: completion.source })}</p>}
        </div>
      )}
    </div>
  );
}

function CompletionCell({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="completion-cell">
      <span className="completion-value">{value}</span>
      <span className="completion-label">{label}</span>
    </div>
  );
}

function RelatedGrid({
  kind,
  query,
}: {
  kind: Kind;
  query: { data?: unknown[]; isLoading: boolean };
}) {
  const { t } = useTranslation();
  if (query.isLoading) return <LoadingPage />;
  const items = (query.data ?? []) as Row[];
  if (items.length === 0) {
    return <EmptyState title={t('browse:emptyTitle')} text={t('entities:noneForGame')} />;
  }
  return (
    <div className="card-grid">
      {items.map((item) => (
        <MaterialCard key={String(item.id)} kind={kind} item={item} />
      ))}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="meta-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
