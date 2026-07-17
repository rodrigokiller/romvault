import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Bell, Languages, CheckCircle2 } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from '@/auth/AuthProvider';

const db = () => getSupabase() as unknown as SupabaseClient;

interface Notification {
  id: string;
  kind: string;
  payload: {
    game_title?: string | null;
    game_slug?: string | null;
    language?: string | null;
    label?: string | null;  // report_resolved
    url?: string | null;    // report_resolved
  };
  created_at: string;
  read_at: string | null;
}

function useMyNotifications() {
  const { user } = useAuth();
  const uid = user?.id;
  return useQuery({
    queryKey: ['notifications', uid],
    enabled: env.configured && Boolean(uid),
    refetchInterval: 5 * 60_000, // dá uma olhada a cada 5min
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await db()
        .from('notifications')
        .select('id, kind, payload, created_at, read_at')
        .eq('user_id', uid as string)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });
}

function useMarkAllRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const uid = user?.id;
      if (!uid) return;
      await db().from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', uid).is('read_at', null);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}

/**
 * Sino do header: "um jogo do seu backlog ganhou tradução" e afins.
 * Abrir o painel marca tudo como lido.
 */
export function NotificationsBell() {
  const { t } = useTranslation();
  const { session, disabled } = useAuth();
  const { data: items = [] } = useMyNotifications();
  const markRead = useMarkAllRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (!session || disabled) return null;
  const unread = items.filter((n) => !n.read_at).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markRead.mutate();
  }

  return (
    <div
      className="share bell"
      ref={ref}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <button
        type="button"
        className="header-icon-btn bell-btn"
        aria-label={t('notif:title')}
        title={t('notif:title')}
        aria-expanded={open}
        onClick={toggle}
      >
        <Bell aria-hidden />
        {unread > 0 && <span className="bell-dot mono">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="share-menu bell-menu" role="menu">
          {items.length === 0 ? (
            <span className="bell-empty mono">{t('notif:empty')}</span>
          ) : (
            items.map((n) => {
              const isReport = n.kind === 'report_resolved';
              const to = isReport
                ? (n.payload.url ?? '/')
                : (n.payload.game_slug ? `/games/${n.payload.game_slug}` : '/');
              const Icon = isReport ? CheckCircle2 : Languages;
              const text = isReport
                ? t('notif:reportResolved', { title: n.payload.label ?? '?' })
                : t('notif:backlogTranslation', {
                    game: n.payload.game_title ?? '?',
                    lang: n.payload.language ?? '?',
                  });
              return (
                <Link
                  key={n.id}
                  to={to}
                  className={`share-item bell-item ${n.read_at ? '' : 'is-unread'}`}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <Icon aria-hidden />
                  <span className="bell-item-text">{text}</span>
                  <span className="bell-item-date mono">{new Date(n.created_at).toLocaleDateString()}</span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
