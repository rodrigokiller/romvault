import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trophy, Languages, Sparkles, Users } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

interface SceneRow {
  kind: 'translation' | 'romhack';
  id: string;
  n: number;
  title: string;
  language: string | null;
  gameTitle: string | null;
  gameSlug: string | null;
}

/** Ranking público: traduções/hacks mais ZERADOS pela comunidade. */
function useSceneTop(limit = 20) {
  return useQuery({
    queryKey: ['sceneTop', limit],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SceneRow[]> => {
      const { data, error } = await db().rpc('scene_top_patches', { lim: limit });
      if (error) return [];
      const rows = (data ?? []) as { patch_kind: 'translation' | 'romhack'; patch_id: string; n: number }[];
      if (rows.length === 0) return [];
      const trIds = rows.filter((r) => r.patch_kind === 'translation').map((r) => r.patch_id);
      const rhIds = rows.filter((r) => r.patch_kind === 'romhack').map((r) => r.patch_id);
      const [trs, rhs] = await Promise.all([
        trIds.length
          ? db().from('translations').select('id, title, language, game:games(title, slug)').in('id', trIds)
          : Promise.resolve({ data: [] }),
        rhIds.length
          ? db().from('romhacks').select('id, title, game:games(title, slug)').in('id', rhIds)
          : Promise.resolve({ data: [] }),
      ]);
      type Mat = { id: string; title: string | null; language?: string | null; game: { title?: string; slug?: string } | null };
      const matOf = new Map<string, Mat>();
      for (const x of (trs.data ?? []) as Mat[]) matOf.set(`translation:${x.id}`, x);
      for (const x of (rhs.data ?? []) as Mat[]) matOf.set(`romhack:${x.id}`, x);
      return rows
        .map((r) => {
          const m = matOf.get(`${r.patch_kind}:${r.patch_id}`);
          if (!m) return null;
          return {
            kind: r.patch_kind,
            id: r.patch_id,
            n: Number(r.n),
            title: m.title ?? m.language ?? '?',
            language: m.language ?? null,
            gameTitle: m.game?.title ?? null,
            gameSlug: m.game?.slug ?? null,
          };
        })
        .filter(Boolean) as SceneRow[];
    },
  });
}

/**
 * /scene — a vitrine social da cena: o que a comunidade mais zera COM patch.
 * Prova social pros tradutores/hackers; descoberta pros jogadores.
 */
export function Scene() {
  const { t } = useTranslation();
  const { data: top, isLoading } = useSceneTop(20);

  if (isLoading) return <LoadingPage />;

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('scene:kicker')}</span>
        <h1>{t('scene:title')}</h1>
        <p className="page-sub">{t('scene:subtitle')}</p>
      </header>

      {!top || top.length === 0 ? (
        <EmptyState icon={Users} title={t('scene:emptyTitle')} text={t('scene:emptyText')} />
      ) : (
        <ol className="scene-rank">
          {top.map((row, i) => (
            <li key={`${row.kind}-${row.id}`} className="scene-rank-item">
              <span className="scene-rank-pos mono">{String(i + 1).padStart(2, '0')}</span>
              {row.kind === 'translation'
                ? <Languages aria-hidden className="scene-rank-icon" />
                : <Sparkles aria-hidden className="scene-rank-icon" />}
              <span className="scene-rank-body">
                <Link to={`/${row.kind === 'translation' ? 'translations' : 'romhacks'}/${row.id}`} className="scene-rank-title">
                  {row.title}
                </Link>
                {row.gameTitle && (
                  <span className="scene-rank-game">
                    {row.gameSlug
                      ? <Link to={`/games/${row.gameSlug}`}>{row.gameTitle}</Link>
                      : row.gameTitle}
                  </span>
                )}
              </span>
              <span className="scene-rank-n mono" title={t('entities:patchUsageHint')}>
                <Trophy aria-hidden /> {t('scene:completions', { count: row.n })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
