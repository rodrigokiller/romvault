import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon, Layers } from 'lucide-react';
import { SearchBox } from '@/components/SearchBox';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { useSearch, type SearchKind } from '@/hooks/useSearch';
import { KIND_META, type Kind } from '@/components/entities/kinds';

const KIND_OF: Record<SearchKind, Kind> = {
  game: 'game', romhack: 'romhack', translation: 'translation',
  document: 'doc', tool: 'tool', article: 'article', series: 'game',
};

const FILTERS: (SearchKind | 'all')[] = ['all', 'game', 'romhack', 'translation', 'document', 'tool', 'article'];

export function Search() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [kind, setKind] = useState<SearchKind | 'all'>('all');
  const { data: results = [], isLoading } = useSearch(q, 25);

  const filtered = useMemo(
    () => (kind === 'all' ? results : results.filter((r) => r.kind === kind)),
    [results, kind],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    for (const r of results) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [results]);

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// search</span>
        <h1>{q ? t('search:resultsFor', { q }) : t('common:searchPlaceholder')}</h1>
        <div style={{ marginTop: 'var(--s4)' }}>
          <SearchBox variant="page" />
        </div>
      </header>

      {!q ? (
        <EmptyState icon={SearchIcon} title={t('search:startTitle')} text={t('search:startText')} />
      ) : isLoading ? (
        <LoadingPage />
      ) : results.length === 0 ? (
        <EmptyState icon={SearchIcon} title={t('search:noResultsTitle')} text={t('search:noResults', { q })} />
      ) : (
        <>
          <div className="search-filters">
            {FILTERS.map((f) => (
              (f === 'all' || counts[f]) ? (
                <button
                  key={f}
                  type="button"
                  className={`search-chip ${kind === f ? 'is-active' : ''}`}
                  onClick={() => setKind(f)}
                >
                  {f === 'all' ? t('browse:filterAll') : t(KIND_META[KIND_OF[f as SearchKind]].kindKey)}
                  <span className="search-chip-n">{counts[f] ?? 0}</span>
                </button>
              ) : null
            ))}
          </div>

          <div className="search-results">
            {filtered.map((r) => {
              const meta = KIND_META[KIND_OF[r.kind]];
              const Icon = meta.icon;
              return (
                <Link key={`${r.kind}-${r.id}`} to={r.to} className="search-result">
                  <span className={`searchbox-kind tone-${meta.tone}`}>
                    {r.kind === 'series' ? <Layers aria-hidden /> : <Icon aria-hidden />}
                  </span>
                  <span className="search-result-body">
                    <span className="search-result-title">
                      {r.title}
                      {r.gameType && r.gameType !== 'main' && (
                        <span className="type-chip mono">{t(`games:type_${r.gameType}`)}</span>
                      )}
                    </span>
                    {r.subtitle && <span className="search-result-sub">{r.subtitle}</span>}
                  </span>
                  <span className="search-result-kind">
                    {r.kind === 'series' ? t('search:kindSeries') : t(meta.kindKey)}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
