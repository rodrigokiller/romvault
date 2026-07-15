import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useInfiniteGames } from '@/hooks/useGames';
import { useDebounce } from '@/hooks/useDebounce';
import { GameCard } from '@/components/entities/GameCard';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { LoadMore } from '@/components/ui/LoadMore';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

export function Games() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState('');
  const [genre, setGenre] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);

  const query = useInfiniteGames({
    platform: platform || undefined,
    genre: genre || undefined,
    search: debounced || undefined,
  });
  const games = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  // Opções derivadas do que já foi carregado (server-side pagina o resto).
  const platforms = useMemo(
    () => [...new Set(games.flatMap((g) => g.platforms ?? []))].sort(),
    [games],
  );
  const genres = useMemo(
    () => [...new Set(games.flatMap((g) => g.genres ?? []))].sort(),
    [games],
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
              {platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('browse:filterGenre')}>
          {(id) => (
            <Select id={id} value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">{t('browse:filterAllMasc')}</option>
              {genres.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
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
        {games.length > 0 && (
          <span className="filter-count">{t('browse:results', { count: games.length })}</span>
        )}
      </div>

      {query.isLoading ? (
        <LoadingPage />
      ) : games.length === 0 ? (
        <EmptyState icon={Gamepad2} title={t('games:emptyTitle')} text={t('games:emptyText')} />
      ) : (
        <>
          <div className="card-grid card-grid-cover">
            {games.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
          <LoadMore
            hasMore={Boolean(query.hasNextPage)}
            loading={query.isFetchingNextPage}
            onMore={() => void query.fetchNextPage()}
          />
        </>
      )}
    </div>
  );
}
