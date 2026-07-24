import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  User as UserIcon, ChevronDown, Upload, Settings, Shield, LogOut, Library, Store, Languages,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { SUPPORTED_LANGS } from '@/i18n/config';
import { useAuth } from '@/auth/AuthProvider';
import { useIsAdmin } from '@/hooks/useProfile';

/**
 * Menu do usuário: um clique no avatar abre TUDO que antes eram ícones soltos
 * no cabeçalho (perfil, biblioteca, enviar, config, idioma, admin, sair). No
 * mobile isso é o que devolve o espaço — a direita fica só com sino + avatar.
 */
export function UserMenu({ username }: { username: string }) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // contador de reportes abertos (some pra não-admin via RLS)
  const { data: openReports = 0 } = useQuery({
    queryKey: ['openReports'],
    enabled: env.configured && isAdmin,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { count } = await (getSupabase() as unknown as SupabaseClient)
        .from('reports').select('*', { count: 'exact', head: true }).is('resolved_at', null);
      return count ?? 0;
    },
  });

  // fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const cur = SUPPORTED_LANGS.find((l) => i18n.language?.startsWith(l.code.slice(0, 2))) ?? SUPPORTED_LANGS[0];
  const cycleLang = () => {
    const idx = SUPPORTED_LANGS.findIndex((l) => l.code === cur.code);
    void i18n.changeLanguage(SUPPORTED_LANGS[(idx + 1) % SUPPORTED_LANGS.length].code);
  };
  const close = () => setOpen(false);

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button" className="user-menu-btn" onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open} title={t('nav:profile')}
      >
        <UserIcon aria-hidden />
        <span className="user-menu-name">{username}</span>
        <ChevronDown className="user-menu-caret" aria-hidden />
        {isAdmin && openReports > 0 && <span className="bell-dot mono">{openReports > 9 ? '9+' : openReports}</span>}
      </button>

      {open && (
        <div className="user-menu-pop" role="menu">
          <Link to={`/u/${username}`} className="nav-drop-item" role="menuitem" onClick={close}>
            <UserIcon aria-hidden /> {t('nav:profile')}
          </Link>
          <Link to={`/u/${username}/library`} className="nav-drop-item" role="menuitem" onClick={close}>
            <Library aria-hidden /> {t('library:viewLibrary')}
          </Link>
          <Link to={`/u/${username}/vitrine`} className="nav-drop-item" role="menuitem" onClick={close}>
            <Store aria-hidden /> {t('vitrine:viewVitrine')}
          </Link>
          <div className="user-menu-sep" />
          <Link to="/submit" className="nav-drop-item" role="menuitem" onClick={close}>
            <Upload aria-hidden /> {t('nav:submit')}
          </Link>
          <Link to="/settings" className="nav-drop-item" role="menuitem" onClick={close}>
            <Settings aria-hidden /> {t('nav:settings')}
          </Link>
          <button type="button" className="nav-drop-item" role="menuitem" onClick={cycleLang}>
            <Languages aria-hidden /> {t('nav:language')}
            <span className="user-menu-badge mono">{cur.flag}</span>
          </button>
          {isAdmin && (
            <Link to="/admin" className="nav-drop-item" role="menuitem" onClick={close}>
              <Shield aria-hidden /> {t('nav:admin')}
              {openReports > 0 && <span className="user-menu-badge mono">{openReports > 9 ? '9+' : openReports}</span>}
            </Link>
          )}
          <div className="user-menu-sep" />
          <button type="button" className="nav-drop-item" role="menuitem" onClick={() => { close(); void signOut(); }}>
            <LogOut aria-hidden /> {t('nav:logout')}
          </button>
        </div>
      )}
    </div>
  );
}
