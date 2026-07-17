import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Users as UsersIcon, User, Search } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { Input } from '@/components/ui/Input';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

interface Member {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  is_admin?: boolean | null;
}

function useMembers() {
  return useQuery({
    queryKey: ['members'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await db()
        .from('profiles')
        .select('id, username, avatar_url, bio, created_at, is_admin')
        .not('username', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });
}

/** Comunidade: descobrir perfis pra seguir (busca por nome/bio). */
export function Users() {
  const { t } = useTranslation();
  const { data: members = [], isLoading } = useMembers();
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) =>
      (m.username ?? '').toLowerCase().includes(term) || (m.bio ?? '').toLowerCase().includes(term));
  }, [members, q]);

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('users:kicker')}</span>
        <h1>{t('users:title')}</h1>
        <p className="page-sub">{t('users:subtitle')}</p>
        <div className="users-search">
          <Search aria-hidden className="users-search-icon" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('users:searchPh')}
            aria-label={t('users:searchPh')}
          />
          <span className="mono users-count">{t('users:count', { count: shown.length })}</span>
        </div>
      </header>

      {isLoading ? (
        <LoadingPage />
      ) : shown.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t('users:emptyTitle')} />
      ) : (
        <div className="users-grid">
          {shown.map((m) => (
            <Link key={m.id} to={`/u/${m.username}`} className="user-card">
              <div className="user-card-avatar">
                {m.avatar_url ? <img src={m.avatar_url} alt="" /> : <User aria-hidden />}
              </div>
              <div className="user-card-body">
                <span className="user-card-name">
                  @{m.username}
                  {m.is_admin && <span className="chip user-card-admin">admin</span>}
                </span>
                {m.bio && <p className="user-card-bio">{m.bio}</p>}
                <span className="user-card-joined mono">
                  {t('profile:joined')} {new Date(m.created_at).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
