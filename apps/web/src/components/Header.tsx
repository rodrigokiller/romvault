import { useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Settings, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuth } from '@/auth/AuthProvider';
import './header.css';

/** Cabeçalho reutilizável, presente em todas as páginas. */
export function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, user, signOut } = useAuth();
  const [q, setQ] = useState('');

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }

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
          <nav className="header-nav" aria-label="Principal">
            <NavLink to="/" end className="header-link">
              {t('nav:home')}
            </NavLink>
            <NavLink to="/games" className="header-link">
              {t('nav:browse')}
            </NavLink>
          </nav>
        </div>

        <form className="header-search" role="search" onSubmit={onSearch}>
          <Search aria-hidden className="header-search-icon" />
          <input
            className="header-search-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('common:searchPlaceholder')}
            aria-label={t('common:searchPlaceholder')}
          />
        </form>

        <div className="header-right">
          <LanguageSwitcher />
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
