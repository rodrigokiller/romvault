import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearch, type SearchKind } from '@/hooks/useSearch';
import { KIND_META, type Kind } from '@/components/entities/kinds';
import { Spinner } from '@/components/ui/feedback';
import './searchbox.css';

const KIND_OF: Record<SearchKind, Kind> = {
  game: 'game',
  romhack: 'romhack',
  translation: 'translation',
  document: 'doc',
  tool: 'tool',
  article: 'article',
};

/**
 * Campo de busca com dropdown de resultados (debounce). Enter sem seleção abre a
 * página /search completa. Reutilizável no header e em qualquer página.
 */
export function SearchBox({ variant = 'header' }: { variant?: 'header' | 'page' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(q, 220);
  const { data: results = [], isFetching } = useSearch(debounced, 6);
  const boxRef = useRef<HTMLDivElement>(null);

  const showDropdown = open && debounced.trim().length >= 2;

  function go(to: string) {
    setOpen(false);
    setQ('');
    setActive(-1);
    navigate(to);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && results[active]) return go(results[active].to);
    const term = q.trim();
    setOpen(false);
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
  }

  return (
    <div className={`searchbox searchbox-${variant}`} ref={boxRef} onBlur={(e) => {
      if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
    }}>
      <form role="search" onSubmit={onSubmit} className="searchbox-form">
        <Search aria-hidden className="searchbox-icon" />
        <input
          className="searchbox-input"
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('common:searchPlaceholder')}
          aria-label={t('common:searchPlaceholder')}
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        {isFetching && showDropdown && <Spinner />}
      </form>

      {showDropdown && (
        <div className="searchbox-drop" role="listbox">
          {results.length === 0 && !isFetching ? (
            <div className="searchbox-empty">{t('search:noResults', { q: debounced })}</div>
          ) : (
            results.map((r, i) => {
              const meta = KIND_META[KIND_OF[r.kind]];
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  key={`${r.kind}-${r.id}`}
                  className={`searchbox-item ${i === active ? 'is-active' : ''}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); go(r.to); }}
                >
                  <span className={`searchbox-kind tone-${meta.tone}`}><Icon aria-hidden /></span>
                  <span className="searchbox-item-body">
                    <span className="searchbox-item-title">{r.title}</span>
                    {r.subtitle && <span className="searchbox-item-sub">{r.subtitle}</span>}
                  </span>
                  <span className="searchbox-item-kind">{t(meta.kindKey)}</span>
                </button>
              );
            })
          )}
          <button type="button" className="searchbox-all" onMouseDown={(e) => {
            e.preventDefault();
            navigate(`/search?q=${encodeURIComponent(debounced.trim())}`);
            setOpen(false);
          }}>
            {t('search:seeAllFor', { q: debounced.trim() })}
          </button>
        </div>
      )}
    </div>
  );
}
