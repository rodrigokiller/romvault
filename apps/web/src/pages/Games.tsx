import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { useGames } from '@/hooks/useGames';
import { GameCard } from '@/components/entities/GameCard';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

export function Games() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState('');
  const [genre, setGenre] = useState('');
  const [search, setSearch] = useState('');

  const { data: games = [], isLoading } = useGames();

  // Opções de filtro derivadas dos dados carregados.
  const platforms = useMemo(
    () => [...new Set(games.flatMap((g) => g.platforms ?? []))].sort(),
    [games],
  );
  const genres = useMemo(
    () => [...new Set(games.flatMap((g) => g.genres ?? []))].sort(),
    [games],
  );

  const filtered = useMemo(
    () =>
      games.filter((g) => {
        if (platform && !(g.platforms ?? []).includes(platform)) return false;
        if (genre && !(g.genres ?? []).includes(genre)) return false;
        if (search && !g.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [games, platform, genre, search],
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
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('browse:filterGenre')}>
          {(id) => (
            <Select id={id} value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">{t('browse:filterAllMasc')}</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
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
        {filtered.length > 0 && (
          <span className="filter-count">
            {t('browse:results', { count: filtered.length })}
          </span>
        )}
      </div>

      {isLoading ? (
        <LoadingPage />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Gamepad2} title={t('games:emptyTitle')} text={t('games:emptyText')} />
      ) : (
        <div className="card-grid">
          {filtered.map((g) => (
            <GameCard key={g.id} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
