import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useGamesPage, useGameLetters, useGameFacets } from '@/hooks/useGames';
import { useDebounce } from '@/hooks/useDebounce';
import { PAGE_SIZE } from '@/hooks/useMaterials';
import { GameCard } from '@/components/entities/GameCard';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { AlphabetBar } from '@/components/ui/AlphabetBar';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

export function Games() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState('');
  const [genre, setGenre] = useState('');
  const [search, setSearch] = useState('');
  const [letter, setLetter] = useState<string | null>(null);
  const [sort, setSort] = useState<'title' | 'newest' | 'oldest'>('title');
  const [page, setPage] = useState(0);
  const debounced = useDebounce(search, 250);

  // qualquer mudança de filtro volta pra primeira página
  useEffect(() => setPage(0), [platform, genre, debounced, letter, sort]);

  const filters = {
    platform: platform || undefined,
    genre: genre || undefined,
    search: debounced || undefined,
    letter,
    sort,
  };
  const query = useGamesPage(filters, page);
  const { data: facets } = useGameFacets();
  const { data: letters } = useGameLetters({ platform: platform || undefined, genre: genre || undefined });

  const games = query.data?.games ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const searching = debounced.length > 0;

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('nav:browse')}</span>
        <h1>{t('games:title')}</h1>
        <p className="page-sub">{t('games:subtitle')}</p>
      </header>

      <div className="filter-bar">
        <Field label={t('browse:filterPlatform')}>
          {(id) => (
            <Select id={id} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">{t('browse:filterAll')}</option>
              {(facets?.platforms ?? []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('browse:filterGenre')}>
          {(id) => (
            <Select id={id} value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">{t('browse:filterAllMasc')}</option>
              {(facets?.genres ?? []).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('browse:sort')}>
          {(id) => (
            <Select id={id} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="title">{t('browse:sortAZ')}</option>
              <option value="newest">{t('browse:sortNewest')}</option>
              <option value="oldest">{t('browse:sortOldest')}</option>
            </Select>
          )}
        </Field>
        <Field label={t('browse:searchPlaceholder')}>
          {(id) => (
            <Input
              id={id}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('browse:searchPlaceholder')}
            />
          )}
        </Field>
        {total > 0 && (
          <span className="filter-count">{t('browse:results', { count: total })}</span>
        )}
      </div>

      {/* Barra A–Z (some quando há busca por texto, filtro mais forte) */}
      {!searching && (
        <AlphabetBar active={letter} available={letters} onPick={setLetter} />
      )}

      {query.isLoading ? (
        <LoadingPage />
      ) : games.length === 0 ? (
        <EmptyState icon={Gamepad2} title={t('games:emptyTitle')} text={t('games:emptyText')} />
      ) : (
        <>
          <div
            className="card-grid card-grid-cover"
            style={{ opacity: query.isPlaceholderData ? 0.55 : 1, transition: 'opacity var(--t-fast)' }}
          >
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
