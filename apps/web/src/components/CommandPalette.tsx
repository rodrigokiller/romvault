import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Home, Gamepad2, Languages, Sparkles, Wrench, FileText, Users, BarChart3,
  Upload, Settings, Shield, User, Library, Store, ArrowLeft, Search, Clock, Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearch, type SearchKind } from '@/hooks/useSearch';
import { KIND_META, type Kind } from '@/components/entities/kinds';
import { useAuth } from '@/auth/AuthProvider';
import { useIsAdmin } from '@/hooks/useProfile';
import './commandpalette.css';

/** Evento global pra abrir a palette de fora (botão de busca do header). */
export const PALETTE_EVENT = 'rv:palette-open';
// eslint-disable-next-line react-refresh/only-export-components
export function openPalette() {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}

const KIND_OF: Record<SearchKind, Kind> = {
  game: 'game', romhack: 'romhack', translation: 'translation',
  document: 'doc', tool: 'tool', article: 'article',
};

interface PaletteItem {
  id: string;
  label: string;
  icon: LucideIcon;
  hint?: string;   // texto à direita (rota, tipo…)
  run: () => void;
}
interface Section {
  title: string;
  items: PaletteItem[];
}

interface Recent { path: string; label: string }
const RECENTS_KEY = 'rv:recents';
const RECENTS_MAX = 8;

function loadRecents(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as Recent[];
  } catch {
    return [];
  }
}

/** Rótulo legível pra uma rota visitada (recentes estilo Discord). */
function labelFor(path: string): string | null {
  if (path === '/' || path.startsWith('/search') || path.startsWith('/login') || path.startsWith('/auth')) return null;
  const seg = path.split('/').filter(Boolean);
  if (seg[0] === 'u' && seg[1]) {
    if (seg[2] === 'library') return `@${seg[1]} · library`;
    if (seg[2] === 'vitrine') return `@${seg[1]} · vitrine`;
    if (seg[2] === 'year') return `@${seg[1]} · ${seg[3] ?? ''}`;
    return `@${seg[1]}`;
  }
  const last = seg[seg.length - 1] ?? '';
  // /games/chrono-trigger -> "Chrono Trigger"; /stats -> "stats"
  const pretty = decodeURIComponent(last)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return seg.length > 1 ? pretty : `/${last}`;
}

/**
 * COMMAND PALETTE (Ctrl+K) — navegação estilo terminal: recentes, páginas,
 * ações (voltar, perfil…) e busca ao vivo no catálogo, tudo sem tirar a mão
 * do teclado.
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { session, user } = useAuth();
  const isAdmin = useIsAdmin();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounce(q, 180);
  const searching = debounced.trim().length >= 2;
  const { data: results = [], isFetching } = useSearch(searching ? debounced : '', 8);

  const username =
    (user?.user_metadata?.username as string | undefined) ??
    user?.email?.split('@')[0] ?? null;

  /* ── abrir/fechar: Ctrl+K global + evento do header ── */
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setQ('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  /* ── recentes: registra cada rota visitada (fora de search/login) ── */
  useEffect(() => {
    const label = labelFor(location.pathname);
    if (!label) return;
    const next: Recent[] = [
      { path: location.pathname, label },
      ...loadRecents().filter((r) => r.path !== location.pathname),
    ].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  }, [location.pathname]);

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  /* ── seções ── */
  const sections = useMemo<Section[]>(() => {
    const pages: PaletteItem[] = [
      { id: 'home', label: t('nav:home'), icon: Home, hint: '/', run: () => go('/') },
      { id: 'games', label: t('nav:games'), icon: Gamepad2, hint: '/games', run: () => go('/games') },
      { id: 'translations', label: t('nav:translations'), icon: Languages, hint: '/translations', run: () => go('/translations') },
      { id: 'romhacks', label: t('nav:romhacks'), icon: Sparkles, hint: '/romhacks', run: () => go('/romhacks') },
      { id: 'tools', label: t('nav:tools'), icon: Wrench, hint: '/tools', run: () => go('/tools') },
      { id: 'docs', label: t('nav:docs'), icon: FileText, hint: '/docs', run: () => go('/docs') },
      { id: 'users', label: t('nav:community'), icon: Users, hint: '/users', run: () => go('/users') },
      { id: 'stats', label: t('nav:stats'), icon: BarChart3, hint: '/stats', run: () => go('/stats') },
      { id: 'scene', label: t('scene:title'), icon: Trophy, hint: '/scene', run: () => go('/scene') },
      { id: 'submit', label: t('nav:submit'), icon: Upload, hint: '/submit', run: () => go('/submit') },
      { id: 'settings', label: t('nav:settings'), icon: Settings, hint: '/settings', run: () => go('/settings') },
      ...(isAdmin ? [{ id: 'admin', label: t('nav:admin'), icon: Shield, hint: '/admin', run: () => go('/admin') }] : []),
    ];
    const actions: PaletteItem[] = [
      { id: 'back', label: t('palette:back'), icon: ArrowLeft, run: () => { setOpen(false); navigate(-1); } },
      ...(session && username ? [
        { id: 'me', label: t('palette:myProfile'), icon: User, hint: `/u/${username}`, run: () => go(`/u/${username}`) },
        { id: 'mylib', label: t('palette:myLibrary'), icon: Library, hint: 'library', run: () => go(`/u/${username}/library`) },
        { id: 'myvitrine', label: t('palette:myVitrine'), icon: Store, hint: 'vitrine', run: () => go(`/u/${username}/vitrine`) },
      ] : []),
    ];

    if (!searching) {
      const recents = loadRecents()
        .filter((r) => r.path !== location.pathname)
        .map<PaletteItem>((r) => ({
          id: `recent:${r.path}`, label: r.label, icon: Clock, hint: r.path, run: () => go(r.path),
        }));
      return [
        ...(recents.length ? [{ title: t('palette:recents'), items: recents }] : []),
        { title: t('palette:pages'), items: pages },
        { title: t('palette:actions'), items: actions },
      ];
    }

    const term = debounced.trim().toLowerCase();
    const pageHits = [...pages, ...actions].filter((p) => p.label.toLowerCase().includes(term));
    const found = results.map<PaletteItem>((r) => {
      const meta = KIND_META[KIND_OF[r.kind]];
      return {
        id: `${r.kind}:${r.id}`,
        label: r.title,
        icon: meta.icon as unknown as LucideIcon,
        hint: t(meta.kindKey),
        run: () => go(r.to),
      };
    });
    const searchAll: PaletteItem = {
      id: 'search-all',
      label: t('palette:searchFor', { q: debounced.trim() }),
      icon: Search,
      run: () => go(`/search?q=${encodeURIComponent(debounced.trim())}`),
    };
    return [
      ...(pageHits.length ? [{ title: t('palette:pages'), items: pageHits }] : []),
      ...(found.length ? [{ title: t('palette:results'), items: found }] : []),
      { title: t('palette:actions'), items: [searchAll] },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, debounced, results, session, username, isAdmin, location.pathname, t]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const clamped = Math.min(active, Math.max(0, flat.length - 1));

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      flat[clamped]?.run();
    }
  }

  // mantém o item ativo visível ao navegar com as setas
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [clamped]);

  let idx = -1;
  return (
    <dialog
      ref={dialogRef}
      className="cmdk"
      onClose={() => setOpen(false)}
      onClick={(e) => { if (e.target === dialogRef.current) setOpen(false); }}
      aria-label={t('palette:title')}
    >
      <div className="cmdk-input-row">
        <span className="cmdk-prompt mono" aria-hidden>&gt;</span>
        <input
          ref={inputRef}
          className="cmdk-input mono"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder={t('palette:placeholder')}
          aria-label={t('palette:title')}
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="cmdk-kbd">Esc</kbd>
      </div>

      <div className="cmdk-list" ref={listRef} role="listbox">
        {flat.length === 0 && !isFetching && (
          <div className="cmdk-empty mono">{t('palette:noResults', { q: debounced.trim() })}</div>
        )}
        {sections.map((s) => (
          <div key={s.title} className="cmdk-section">
            <div className="cmdk-section-title mono">// {s.title.toLowerCase()}</div>
            {s.items.map((item) => {
              idx += 1;
              const i = idx;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={i === clamped}
                  data-active={i === clamped}
                  className={`cmdk-item ${i === clamped ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); item.run(); }}
                >
                  <Icon aria-hidden className="cmdk-item-icon" />
                  <span className="cmdk-item-label">{item.label}</span>
                  {item.hint && <span className="cmdk-item-hint mono">{item.hint}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="cmdk-foot mono">
        <span><kbd className="cmdk-kbd">&uarr;</kbd><kbd className="cmdk-kbd">&darr;</kbd> {t('palette:hintNav')}</span>
        <span><kbd className="cmdk-kbd">Enter</kbd> {t('palette:hintOpen')}</span>
        <span><kbd className="cmdk-kbd">Esc</kbd> {t('palette:hintClose')}</span>
      </div>
    </dialog>
  );
}
