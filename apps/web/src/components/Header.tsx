import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Settings, LogIn, LogOut, User as UserIcon, Shield, Upload, Search, ChevronDown,
  Gamepad2, Languages, Sparkles, Wrench, FileText, Layers, Newspaper,
  Users, Trophy, BarChart3, Library, Store,
} from 'lucide-react';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { openPalette } from './CommandPalette';
import { NotificationsBell } from './NotificationsBell';
import { useAuth } from '@/auth/AuthProvider';
import { useIsAdmin } from '@/hooks/useProfile';
import './header.css';

/** Item de dropdown da nav (submenu terminal: hover/focus abre pra baixo). */
interface DropItem {
  to: string;
  label: string;
  icon: typeof Gamepad2;
}

function NavDrop({ label, items }: { label: string; items: DropItem[] }) {
  return (
    <div className="nav-drop">
      <button type="button" className="header-link nav-drop-btn">
        {label} <ChevronDown aria-hidden />
      </button>
      <div className="nav-drop-menu" role="menu">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <NavLink key={it.to} to={it.to} className="nav-drop-item" role="menuitem">
              <Icon aria-hidden /> {it.label}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

/** Cabeçalho reutilizável, presente em todas as páginas. */
export function Header() {
  const { t } = useTranslation();
  const { session, user, signOut } = useAuth();
  const isAdmin = useIsAdmin();

  const username =
    (user?.user_metadata?.username as string | undefined) ??
    user?.email?.split('@')[0] ??
    'perfil';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="header-left">
          <Link to="/" className="header-brand">
            <Logo />
          </Link>
          {/* nav enxuta: 2 links diretos + submenus (o resto vive no Ctrl+K) */}
          <nav className="header-nav" aria-label="Principal">
            <NavLink to="/games" className="header-link">
              {t('nav:games')}
            </NavLink>
            <NavDrop
              label={t('nav:catalog')}
              items={[
                { to: '/translations', label: t('nav:translations'), icon: Languages },
                { to: '/romhacks', label: t('nav:romhacks'), icon: Sparkles },
                { to: '/tools', label: t('nav:tools'), icon: Wrench },
                { to: '/docs', label: t('nav:docs'), icon: FileText },
                { to: '/collections', label: t('collections:title'), icon: Layers },
                { to: '/articles', label: t('nav:articles'), icon: Newspaper },
              ]}
            />
            <NavDrop
              label={t('nav:community')}
              items={[
                { to: '/users', label: t('users:title'), icon: Users },
                { to: '/scene', label: t('scene:title'), icon: Trophy },
                { to: '/stats', label: t('nav:stats'), icon: BarChart3 },
              ]}
            />
            {session && (
              <NavDrop
                label={t('nav:myShelf')}
                items={[
                  { to: `/u/${username}/library`, label: t('library:viewLibrary'), icon: Library },
                  { to: `/u/${username}/vitrine`, label: t('vitrine:viewVitrine'), icon: Store },
                  { to: `/u/${username}`, label: t('nav:profile'), icon: UserIcon },
                ]}
              />
            )}
          </nav>
        </div>

        {/* busca compacta: abre a command palette (Ctrl+K) sem disputar espaço com a nav */}
        <button type="button" className="header-search-btn" onClick={openPalette}>
          <Search aria-hidden />
          <span className="header-search-btn-label">{t('common:searchPlaceholder')}</span>
          <kbd className="header-search-kbd">Ctrl K</kbd>
        </button>

        <div className="header-right">
          <NotificationsBell />
          <LanguageSwitcher />
          {isAdmin && (
            <Link
              to="/admin"
              className="header-icon-btn"
              aria-label={t('nav:admin')}
              title={t('nav:admin')}
            >
              <Shield aria-hidden />
            </Link>
          )}
          {/* Enviar saiu da nav (catálogo ocupou o espaço) — ícone sempre visível */}
          <Link
            to="/submit"
            className="header-icon-btn"
            aria-label={t('nav:submit')}
            title={t('nav:submit')}
          >
            <Upload aria-hidden />
          </Link>
          <Link
            to="/settings"
            className="header-icon-btn"
            aria-label={t('nav:settings')}
            title={t('nav:settings')}
          >
            <Settings aria-hidden />
          </Link>
          {session ? (
            <>
              <Link to={`/u/${username}`} className="header-user" title={t('nav:profile')}>
                <UserIcon aria-hidden />
                <span className="header-user-name">{username}</span>
              </Link>
              <button
                type="button"
                className="header-icon-btn"
                onClick={() => void signOut()}
                aria-label={t('nav:logout')}
                title={t('nav:logout')}
              >
                <LogOut aria-hidden />
              </button>
            </>
          ) : (
            <Link to="/login" className="header-login">
              <LogIn aria-hidden />
              <span>{t('nav:login')}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
