import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Trophy, Languages, Sparkles, Users, Download, Flame } from 'lucide-react';
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

interface HotRow { kind: string; id: string; n: number; title: string; gameTitle: string | null; gameSlug: string | null }
const HOT_TABLES: Record<string, { table: string; route: string }> = {
  romhack: { table: 'romhacks', route: 'romhacks' },
  translation: { table: 'translations', route: 'translations' },
  doc: { table: 'documents', route: 'docs' },
  tool: { table: 'tools', route: 'tools' },
};

/** "Em alta na semana": downloads dos últimos 7 dias (RPC trending_week). */
function useSceneHot(limit = 10) {
  return useQuery({
    queryKey: ['sceneHot', limit],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HotRow[]> => {
      const { data, error } = await db().rpc('trending_week', { days: 7, lim: limit });
      if (error) return [];
      const rows = (data ?? []) as { subject_type: string; subject_id: string; cnt: number }[];
      const byKind = new Map<string, string[]>();
      for (const r of rows) {
        if (!HOT_TABLES[r.subject_type]) continue;
        byKind.set(r.subject_type, [...(byKind.get(r.subject_type) ?? []), r.subject_id]);
      }
      const matOf = new Map<string, { title: string | null; game: { title?: string; slug?: string } | null }>();
      await Promise.all([...byKind.entries()].map(async ([kind, ids]) => {
        const q = kind === 'tool'
          ? db().from('tools').select('id, title').in('id', ids)
          : db().from(HOT_TABLES[kind].table).select('id, title, game:games(title, slug)').in('id', ids);
        const { data: mats } = await q;
        for (const m of (mats ?? []) as unknown as { id: string; title: string | null; game?: { title?: string; slug?: string } | null }[]) {
          matOf.set(`${kind}:${m.id}`, { title: m.title, game: m.game ?? null });
        }
      }));
      return rows
        .map((r) => {
          const m = matOf.get(`${r.subject_type}:${r.subject_id}`);
          if (!m) return null;
          return {
            kind: r.subject_type, id: r.subject_id, n: Number(r.cnt),
            title: m.title ?? '?', gameTitle: m.game?.title ?? null, gameSlug: m.game?.slug ?? null,
          };
        })
        .filter(Boolean) as HotRow[];
    },
  });
}

/**
 * /scene — a vitrine social da cena: o que a comunidade mais zera COM patch
 * (all-time) + o que está EM ALTA na semana (downloads). Prova social pros
 * tradutores/hackers; descoberta pros jogadores.
 */
export function Scene() {
  const { t } = useTranslation();
  const { data: top, isLoading } = useSceneTop(20);
  const { data: hot = [] } = useSceneHot(10);

  if (isLoading) return <LoadingPage />;

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('scene:kicker')}</span>
        <h1>{t('scene:title')}</h1>
        <p className="page-sub">{t('scene:subtitle')}</p>
      </header>

      {hot.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2><Flame aria-hidden style={{ width: 16, height: 16, verticalAlign: '-2px' }} /> {t('scene:hotTitle')}</h2>
          </div>
          <ol className="scene-rank">
            {hot.map((row, i) => (
              <li key={`${row.kind}-${row.id}`} className="scene-rank-item">
                <span className="scene-rank-pos mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="scene-rank-body">
                  <Link to={`/${HOT_TABLES[row.kind].route}/${row.id}`} className="scene-rank-title">
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
                <span className="scene-rank-n mono" title={t('scene:hotHint')}>
                  <Download aria-hidden /> {row.n}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

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
