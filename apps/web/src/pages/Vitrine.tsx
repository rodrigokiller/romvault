import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Store, ArrowLeft } from 'lucide-react';
import type { Game } from '@romvault/core';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useProfileByUsername } from '@/hooks/useProfile';
import { FadeImg } from '@/components/ui/FadeImg';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { PLATFORM_THEMES as THEMES } from '@/lib/platformThemes';

const db = () => getSupabase() as unknown as SupabaseClient;

interface OwnedGame {
  game: Game;
  platforms: string[]; // plataformas das CÓPIAS deste usuário
  acquired: string;    // 1ª cópia (ordem padrão: chegada na coleção)
  customArt: string | null;
}

/** Jogos que o usuário TEM (cópias), com jogo embutido + arte custom do track. */
function useOwnedGames(userId: string | undefined) {
  return useQuery({
    queryKey: ['ownedGames', userId],
    enabled: env.configured && Boolean(userId),
    queryFn: async (): Promise<OwnedGame[]> => {
      const [{ data: copies }, { data: arts }] = await Promise.all([
        db().from('game_copies')
          .select('game_id, platform, created_at, game:games(*)')
          .eq('user_id', userId as string)
          .order('created_at', { ascending: true })
          .range(0, 4999),
        db().from('game_tracks')
          .select('game_id, custom_art')
          .eq('user_id', userId as string)
          .not('custom_art', 'is', null)
          .range(0, 4999),
      ]);
      const artOf = new Map((arts ?? []).map((r) => [r.game_id as string, r.custom_art as string]));
      const map = new Map<string, OwnedGame>();
      for (const c of (copies ?? []) as unknown as { game_id: string; platform: string; created_at: string; game: Game | null }[]) {
        if (!c.game) continue;
        const prev = map.get(c.game_id);
        if (prev) {
          if (!prev.platforms.includes(c.platform)) prev.platforms.push(c.platform);
        } else {
          map.set(c.game_id, {
            game: c.game,
            platforms: [c.platform],
            acquired: c.created_at,
            customArt: artOf.get(c.game_id) ?? null,
          });
        }
      }
      // ordem padrão: chegada na coleção (novos no fim)
      return [...map.values()].sort((a, b) => a.acquired.localeCompare(b.acquired));
    },
  });
}

/**
 * VITRINE — apresentação dos jogos que o usuário TEM (spec v2, estilo app do
 * Nintendo Switch Online): grid masonry de PROPORÇÃO NATURAL (paisagem ocupa
 * largura, retrato ocupa altura — sem tarjas), views TODOS + por plataforma.
 */
export function Vitrine() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const { data: profile, isLoading: profileLoading } = useProfileByUsername(username);
  const { data: owned = [], isLoading } = useOwnedGames(profile?.id);
  const [view, setView] = useState<string>('all');
  const [artMode, setArtMode] = useState<'box' | 'store'>('box');

  // views: TODOS + cada plataforma em que há cópias
  const platforms = useMemo(
    () => [...new Set(owned.flatMap((o) => o.platforms))].sort(),
    [owned],
  );
  const shown = useMemo(
    () => (view === 'all' ? owned : owned.filter((o) => o.platforms.includes(view))),
    [owned, view],
  );
  const accent = view !== 'all' ? THEMES[view] : undefined;

  if (profileLoading || isLoading) return <LoadingPage />;
  if (!profile) {
    return <div className="container"><EmptyState icon={Store} title={t('profile:notFound')} /></div>;
  }

  return (
    <div
      className="vitrine"
      style={accent ? ({ '--vt-accent': accent } as React.CSSProperties) : undefined}
    >
      {/* fundo temático da plataforma (tipográfico até os desenhos chegarem) */}
      {view !== 'all' && (
        <span className="vitrine-bg mono" aria-hidden>{view}</span>
      )}

      <div className="container vitrine-inner">
        <header className="vitrine-head">
          <div>
            <Link to={`/u/${username}`} className="back-link">
              <ArrowLeft aria-hidden /> @{profile.username}
            </Link>
            <h1>{t('vitrine:title', { user: profile.username ?? username })}</h1>
            <p className="page-sub">{t('vitrine:subtitle', { count: owned.length })}</p>
          </div>
          <button
            type="button"
            className="lib-stat lib-showcase"
            onClick={() => setArtMode((m) => (m === 'box' ? 'store' : 'box'))}
          >
            {artMode === 'box' ? t('library:artBox') : t('library:artStore')}
          </button>
        </header>

        {/* estantes: TODOS + plataformas */}
        <div className="vitrine-tabs" role="tablist">
          <button
            type="button" role="tab" aria-selected={view === 'all'}
            className={`vitrine-tab ${view === 'all' ? 'is-active' : ''}`}
            onClick={() => setView('all')}
          >
            {t('vitrine:all')} <span className="search-chip-n">{owned.length}</span>
          </button>
          {platforms.map((p) => (
            <button
              key={p} type="button" role="tab" aria-selected={view === p}
              className={`vitrine-tab ${view === p ? 'is-active' : ''}`}
              style={view === p && THEMES[p] ? { color: THEMES[p], borderColor: THEMES[p] } : undefined}
              onClick={() => setView(p)}
            >
              {p} <span className="search-chip-n">{owned.filter((o) => o.platforms.includes(p)).length}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={Store} title={t('vitrine:emptyTitle')} text={t('vitrine:emptyText')} />
        ) : (
          <div className="vitrine-grid">
            {shown.map((o) => {
              const meta = (o.game.metadata as unknown as { box3d?: string; boxart?: string } | null) ?? null;
              // prioridade: arte CUSTOM do usuário > (caixa: box3d > boxart > loja) > loja
              const art = o.customArt
                ?? (artMode === 'box' ? (meta?.box3d ?? meta?.boxart ?? o.game.cover_url) : o.game.cover_url)
                ?? o.game.thumbnail;
              return (
                <Link key={o.game.id} to={`/games/${o.game.slug}`} className="vitrine-card" title={o.game.title}>
                  {art ? (
                    <FadeImg src={art} alt={o.game.title} />
                  ) : (
                    <span className="vitrine-card-fallback">{o.game.title}</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
