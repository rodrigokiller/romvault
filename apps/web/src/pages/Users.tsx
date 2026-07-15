import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Users as UsersIcon, User } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

interface Member {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

function useMembers() {
  return useQuery({
    queryKey: ['members'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await db()
        .from('profiles')
        .select('id, username, avatar_url, bio, created_at')
        .not('username', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });
}

/** Comunidade: descobrir perfis pra seguir. */
export function Users() {
  const { t } = useTranslation();
  const { data: members = [], isLoading } = useMembers();

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('users:kicker')}</span>
        <h1>{t('users:title')}</h1>
        <p className="page-sub">{t('users:subtitle')}</p>
      </header>

      {isLoading ? (
        <LoadingPage />
      ) : members.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t('users:emptyTitle')} />
      ) : (
        <div className="users-grid">
          {members.map((m) => (
            <Link key={m.id} to={`/u/${m.username}`} className="user-card">
              <div className="user-card-avatar">
                {m.avatar_url ? <img src={m.avatar_url} alt="" /> : <User aria-hidden />}
              </div>
              <div className="user-card-body">
                <span className="user-card-name">@{m.username}</span>
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
