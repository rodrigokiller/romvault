import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BarChart3 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useStats } from '@/hooks/useHome';
import { langCode } from '@/hooks/useTranslationLangs';
import { LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

interface Row { label: string; total: number }

function useCatalogStats() {
  return useQuery({
    queryKey: ['catalogStats'],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ platforms: Row[]; languages: Row[] }> => {
      const [p, l] = await Promise.all([
        db().rpc('games_per_platform'),
        db().rpc('translations_per_language'),
      ]);
      return {
        platforms: ((p.data ?? []) as { platform: string; total: number }[])
          .map((r) => ({ label: r.platform, total: Number(r.total) })),
        // agrega por CÓDIGO (Portuguese (Brazil) + Portugues (BR) -> BR)
        languages: Object.entries(
          ((l.data ?? []) as { language: string; total: number }[]).reduce<Record<string, number>>(
            (acc, r) => {
              const code = langCode(r.language);
              acc[code] = (acc[code] ?? 0) + Number(r.total);
              return acc;
            }, {}),
        ).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total),
      };
    },
  });
}

function Bars({ rows, max: maxOverride }: { rows: Row[]; max?: number }) {
  const max = maxOverride ?? Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="stat-bars">
      {rows.map((r) => (
        <div key={r.label} className="stat-bar-row">
          <span className="stat-bar-label mono">{r.label}</span>
          <div className="stat-bar-track">
            <div className="stat-bar-fill" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
          <span className="stat-bar-num mono">{r.total.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/** Números do acervo — a vitrine pública do tamanho do projeto. */
export function Stats() {
  const { t } = useTranslation();
  const { data: totals } = useStats();
  const { data, isLoading } = useCatalogStats();

  if (isLoading) return <LoadingPage />;

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('stats:kicker')}</span>
        <h1>{t('stats:title')}</h1>
        <p className="page-sub">{t('stats:subtitle')}</p>
      </header>

      {totals && (
        <div className="hero-stats" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0, marginBottom: 'var(--s6)' }}>
          {([['games', totals.games], ['romhacks', totals.romhacks], ['translations', totals.translations], ['tools', totals.tools]] as const).map(([k, v]) => (
            <div className="hero-stat" key={k}>
              <span className="hero-stat-num">{v.toLocaleString()}</span>
              <span className="hero-stat-label">{t(`home:stat${k.charAt(0).toUpperCase() + k.slice(1)}`)}</span>
            </div>
          ))}
        </div>
      )}

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2><BarChart3 aria-hidden style={{ width: 18, height: 18, verticalAlign: '-3px' }} /> {t('stats:byPlatform')}</h2>
        </div>
        <Bars rows={(data?.platforms ?? []).slice(0, 16)} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t('stats:byLanguage')}</h2>
        </div>
        <Bars rows={(data?.languages ?? []).slice(0, 12)} />
      </section>
    </div>
  );
}
