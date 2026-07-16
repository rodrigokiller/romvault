import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, SlidersHorizontal, ChevronUp } from 'lucide-react';
import { useGamesPage, useGameLetters, useGameFacets, type GamesFilter } from '@/hooks/useGames';
import { useDebounce } from '@/hooks/useDebounce';
import { useTranslationLangs } from '@/hooks/useTranslationLangs';
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
  // padrão de loja (Steam/eShop/PS Store): mais novos primeiro, SÓ lançados
  const [sort, setSort] = useState<'title' | 'newest' | 'oldest'>('newest');
  const [release, setRelease] = useState<'released' | 'upcoming' | 'all'>('released');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPage] = useState(0);
  const debounced = useDebounce(search, 250);

  // qualquer mudança de filtro volta pra primeira página
  useEffect(() => setPage(0), [platform, genre, debounced, letter, sort, release, yearFrom, yearTo]);

  const filters: GamesFilter = {
    platform: platform || undefined,
    genre: genre || undefined,
    search: debounced || undefined,
    letter,
    sort,
    release,
    yearFrom: /^\d{4}$/.test(yearFrom) ? Number(yearFrom) : undefined,
    yearTo: /^\d{4}$/.test(yearTo) ? Number(yearTo) : undefined,
  };
  const query = useGamesPage(filters, page);
  const { data: facets } = useGameFacets();
  const { data: letters } = useGameLetters({ platform: platform || undefined, genre: genre || undefined });

  const games = query.data?.games ?? [];
  const total = query.data?.total ?? 0;
  const { data: langMap } = useTranslationLangs(games.map((g) => g.id));
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const searching = debounced.length > 0;
  // quantos filtros extras estão ativos (pro badge do botão)
  const extraActive = useMemo(
    () => [release !== 'released', Boolean(yearFrom), Boolean(yearTo)].filter(Boolean).length,
    [release, yearFrom, yearTo],
  );

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
              <option value="newest">{t('browse:sortNewest')}</option>
              <option value="oldest">{t('browse:sortOldest')}</option>
              <option value="title">{t('browse:sortAZ')}</option>
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
        <button
          type="button"
          className={`more-filters-btn ${moreOpen || extraActive > 0 ? 'is-active' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          {moreOpen ? <ChevronUp aria-hidden /> : <SlidersHorizontal aria-hidden />}
          {t('browse:moreFilters')}
          {extraActive > 0 && <span className="search-chip-n">{extraActive}</span>}
        </button>
        {total > 0 && (
          <span className="filter-count">{t('browse:results', { count: total })}</span>
        )}
      </div>

      {/* linha expansível de filtros avançados */}
      {moreOpen && (
        <div className="filter-bar filter-bar-extra">
          <Field label={t('browse:filterRelease')}>
            {(id) => (
              <Select id={id} value={release} onChange={(e) => setRelease(e.target.value as typeof release)}>
                <option value="released">{t('browse:releaseReleased')}</option>
                <option value="upcoming">{t('browse:releaseUpcoming')}</option>
                <option value="all">{t('browse:releaseAll')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('browse:yearFrom')}>
            {(id) => (
              <Input id={id} type="number" min={1970} max={2100} placeholder="1990"
                value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
            )}
          </Field>
          <Field label={t('browse:yearTo')}>
            {(id) => (
              <Input id={id} type="number" min={1970} max={2100} placeholder="1999"
                value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
            )}
          </Field>
          {extraActive > 0 && (
            <button
              type="button"
              className="search-chip"
              style={{ alignSelf: 'flex-end', marginBottom: 6 }}
              onClick={() => { setRelease('released'); setYearFrom(''); setYearTo(''); }}
            >
              {t('browse:clearFilters')}
            </button>
          )}
        </div>
      )}

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
              <GameCard key={g.id} game={g} translationBadges={langMap?.get(g.id)} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
