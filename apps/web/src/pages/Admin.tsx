import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { Trash2, ShieldAlert, Database as DbIcon, DownloadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState, LoadingPage, Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useIsAdmin, useMyProfile } from '@/hooks/useProfile';
import { useDeleteEntity } from '@/hooks/useMutations';

const db = () => getSupabase() as unknown as SupabaseClient;

const IGDB_PLATFORMS = [
  'snes', 'nes', 'n64', 'gb', 'gbc', 'gba', 'nds',
  'ps1', 'ps2', 'genesis', 'saturn', 'dreamcast', 'master', 'gamegear', 'tg16', 'arcade',
];

/** Dispara a Edge Function `igdb-sync` (só admin; requer deploy + secrets). */
function IgdbSyncPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [platform, setPlatform] = useState('snes');
  const [limit, setLimit] = useState(50);
  const [pages, setPages] = useState(1);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const { data, error } = await getSupabase().functions.invoke('igdb-sync', {
        body: { platform, limit, pages },
      });
      if (error) throw error;
      const d = data as { imported?: number; skipped?: number; error?: string };
      if (d?.error) throw new Error(d.error);
      toast.success(t('admin:syncDone', { imported: d?.imported ?? 0, skipped: d?.skipped ?? 0 }));
      void qc.invalidateQueries();
    } catch (err) {
      // erro de rede/preflight = função não deployada (ou sem --no-verify-jwt)
      const msg = err instanceof Error ? err.message : '';
      const notDeployed = /failed to send|fetch|networkerror/i.test(msg) || (err as { name?: string })?.name === 'FunctionsFetchError';
      toast.error(notDeployed ? t('admin:syncNotDeployed') : (msg || t('forms:submitError')));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="sync-panel">
      <div>
        <div className="card-title">{t('admin:syncTitle')}</div>
        <div className="card-sub">{t('admin:syncHint')}</div>
      </div>
      <div className="sync-row">
        <Field label={t('admin:syncPlatform')}>
          {(id) => (
            <Select id={id} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {IGDB_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          )}
        </Field>
        <Field label={t('admin:syncLimit')}>
          {(id) => <Input id={id} type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />}
        </Field>
        <Field label={t('admin:syncPages')}>
          {(id) => <Input id={id} type="number" min={1} max={20} value={pages} onChange={(e) => setPages(Number(e.target.value))} />}
        </Field>
        <Button variant="primary" onClick={() => void run()} disabled={running}>
          {running ? <Spinner /> : <><DownloadCloud /> {t('admin:syncRun')}</>}
        </Button>
      </div>
      <p className="field-hint">{t('admin:syncNote')}</p>
    </Card>
  );
}

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

      <IgdbSyncPanel />

      <div className="type-seg" role="tablist" style={{ marginTop: 'var(--s6)' }}>
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
