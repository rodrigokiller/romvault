import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { Trash2, ShieldAlert, Database as DbIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useIsAdmin, useMyProfile } from '@/hooks/useProfile';
import { useDeleteEntity } from '@/hooks/useMutations';

const db = () => getSupabase() as unknown as SupabaseClient;

const TABLES = ['games', 'romhacks', 'translations', 'documents', 'tools', 'articles'] as const;
type AdminTable = (typeof TABLES)[number];

interface AdminRow { id: string; title: string; created_at: string }

function useAdminList(table: AdminTable) {
  return useQuery({
    queryKey: ['admin', table],
    enabled: env.configured,
    queryFn: async (): Promise<AdminRow[]> => {
      const { data, error } = await db()
        .from(table)
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AdminRow[];
    },
  });
}

export function Admin() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isLoading: profileLoading } = useMyProfile();
  const isAdmin = useIsAdmin();
  const [table, setTable] = useState<AdminTable>('games');
  const list = useAdminList(table);
  const del = useDeleteEntity();

  if (profileLoading) return <LoadingPage />;
  if (!isAdmin) {
    return (
      <div className="container">
        <EmptyState icon={ShieldAlert} title={t('admin:forbiddenTitle')} text={t('admin:forbiddenText')} />
      </div>
    );
  }

  async function remove(row: AdminRow) {
    if (!window.confirm(t('admin:confirmDelete', { title: row.title }))) return;
    try {
      await del.mutateAsync({ table, id: row.id });
      toast.success(t('admin:deleted', { title: row.title }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  const rows = list.data ?? [];

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// admin</span>
        <h1>{t('admin:title')}</h1>
        <p className="page-sub">{t('admin:subtitle')}</p>
      </header>

      <div className="type-seg" role="tablist">
        {TABLES.map((tbl) => (
          <button
            key={tbl}
            type="button"
            role="tab"
            aria-selected={tbl === table}
            className={`type-seg-btn ${tbl === table ? 'is-active' : ''}`}
            onClick={() => setTable(tbl)}
          >
            <DbIcon aria-hidden /> {tbl}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <LoadingPage />
      ) : rows.length === 0 ? (
        <EmptyState icon={DbIcon} title={t('browse:emptyTitle')} />
      ) : (
        <div className="admin-table">
          {rows.map((row) => (
            <div key={row.id} className="admin-row">
              <span className="admin-row-title">{row.title}</span>
              <span className="admin-row-date mono">{new Date(row.created_at).toLocaleDateString()}</span>
              <Button variant="danger" size="sm" onClick={() => void remove(row)} disabled={del.isPending}>
                <Trash2 /> {t('admin:delete')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
