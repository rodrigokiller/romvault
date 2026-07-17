import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
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

function humanize(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
        <div className="detail-cover">
          {game?.cover_url ? (
            <img src={game.cover_url} alt={title} />
          ) : (
            <Gamepad2 aria-hidden />
          )}
        </div>
        <div className="detail-info">
          <span className="kicker">// {t('entities:kindGame')}</span>
          <h1>{title}</h1>
          {game?.alt_title && <p className="muted-text">{game.alt_title}</p>}
          {game?.description && <p className="page-sub">{game.description}</p>}
          <dl className="meta-grid">
            <MetaItem label={t('games:developer')} value={game?.developer} />
            <MetaItem label={t('games:publisher')} value={game?.publishers?.join(', ')} />
            <MetaItem label={t('games:released')} value={game?.release_date} />
            <MetaItem label={t('games:franchise')} value={game?.franchise} />
            <MetaItem label={t('games:genres')} value={game?.genres?.join(', ')} />
            <MetaItem label={t('games:ageRating')} value={game?.age_rating} />
          </dl>
          {game?.platforms && game.platforms.length > 0 && (
            <div className="tile-badges" style={{ marginTop: 'var(--s4)' }}>
              {game.platforms.map((p) => (
                <Badge key={p} tone="accent">{p}</Badge>
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
              <TrackButton gameId={game.id} />
              <FavoriteButton subjectType="game" subjectId={game.id} />
              <ShareButton title={title} />
            </div>
          )}
          {game && <CopiesWidget gameId={game.id} platforms={game.platforms ?? []} patchOptions={patchOptions} />}
          {game && <PlaythroughsWidget gameId={game.id} patchOptions={patchOptions} />}
          {game && (
            <AdminItemTools
              gameId={game.id}
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
            {screenshots.length > 0 ? (
              <ScreenshotGrid images={screenshots} />
            ) : (
              !hasScans(game?.metadata) && <EmptyState title={t('games:tabImages')} text={t('common:comingSoonText')} />
            )}
          </>
        )}

        {tab === 'releases' && (
          <dl className="meta-grid">
            <MetaItem label={t('games:released')} value={game?.release_date} />
            <MetaItem label={t('games:platforms')} value={game?.platforms?.join(', ')} />
            {game?.regional_titles &&
              Object.entries(game.regional_titles as Record<string, string>).map(([region, name]) => (
                <MetaItem key={region} label={region} value={name} />
              ))}
          </dl>
        )}

        {tab === 'translations' && <RelatedGrid kind="translation" query={translations} />}
        {tab === 'romhacks' && <RelatedGrid kind="romhack" query={romhacks} />}
        {tab === 'docs' && <RelatedGrid kind="doc" query={documents} />}
      </div>

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
