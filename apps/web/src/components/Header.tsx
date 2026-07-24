import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LogIn, Search, ChevronDown, User as UserIcon,
  Gamepad2, Languages, Sparkles, Wrench, FileText, Layers, Newspaper,
  Users, Trophy, BarChart3, Library, Store, MonitorPlay, CalendarClock,
} from 'lucide-react';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { openPalette } from './CommandPalette';
import { NotificationsBell } from './NotificationsBell';
import { UserMenu } from './UserMenu';
import { useAuth } from '@/auth/AuthProvider';
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
  const { session, user } = useAuth();

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
                { to: '/platforms', label: t('platforms:title'), icon: MonitorPlay },
                { to: '/upcoming', label: t('upcoming:title'), icon: CalendarClock },
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

        {/* direita enxuta: logado = sino + avatar (o resto vive no menu do
            usuário). Deslogado = idioma + entrar. */}
        <div className="header-right">
          {session ? (
            <>
              <NotificationsBell />
              <UserMenu username={username} />
            </>
          ) : (
            <>
              <LanguageSwitcher />
              <Link to="/login" className="header-login">
                <LogIn aria-hidden />
                <span>{t('nav:login')}</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
