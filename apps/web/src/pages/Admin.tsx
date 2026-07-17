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
  'snes', 'nes', 'n64', 'gamecube', 'wii', 'wiiu', 'switch', 'switch2',
  'gb', 'gbc', 'gba', 'nds', '3ds',
  'genesis', 'mastersystem', 'gamegear', 'saturn', 'dreamcast',
  'ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'psp', 'vita',
  'xbox', 'x360', 'xboxone', 'xseries',
  'pc', 'arcade', 'tg16', 'neogeo',
];

/** Cobertura de arte do catálogo: sem capa / sem boxart / com box3D. */
function ArtCoverage() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['artCoverage'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const head = { count: 'exact' as const, head: true };
      const [a, b, cQ, d] = await Promise.all([
        db().from('games').select('*', head),
        db().from('games').select('*', head).is('cover_url', null),
        db().from('games').select('*', head).is('metadata->boxart', null),
        db().from('games').select('*', head).not('metadata->box3d', 'is', null),
      ]);
      return {
        total: a.count ?? 0, noCover: b.count ?? 0,
        noBoxart: cQ.count ?? 0, withBox3d: d.count ?? 0,
      };
    },
  });
  if (!data) return null;
  return (
    <div className="art-coverage mono">
      <span>{t('admin:artTotal', { count: data.total })}</span>
      <span className={data.noCover > 0 ? 'art-warn' : 'art-ok'}>{t('admin:artNoCover', { count: data.noCover })}</span>
      <span className={data.noBoxart > 0 ? 'art-warn' : 'art-ok'}>{t('admin:artNoBoxart', { count: data.noBoxart })}</span>
      <span className="art-ok">{t('admin:artBox3d', { count: data.withBox3d })}</span>
    </div>
  );
}

/**
 * Fila de arte: jogos SEM capa ordenados por IMPORTÂNCIA (nº de vínculos:
 * hacks+traduções+tracks+cópias). Botão processa a fila via game-sync (IGDB),
 * um por um, com progresso — curadoria em série sem visitar página por página.
 */
function ArtQueue() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; fixed: number } | null>(null);
  const { data: queue = [], refetch } = useQuery({
    queryKey: ['artQueue'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('games_missing_cover', { lim: 30 });
      if (error) return [] as { id: string; title: string; platforms: string[] | null; links: number }[];
      return (data ?? []) as { id: string; title: string; platforms: string[] | null; links: number }[];
    },
  });

  async function runBatch() {
    setRunning(true);
    let fixed = 0;
    setProgress({ done: 0, total: queue.length, fixed });
    for (let i = 0; i < queue.length; i++) {
      try {
        const { data, error } = await getSupabase().functions.invoke('game-sync', {
          body: { game_id: queue[i].id, action: 'igdb' },
        });
        const d = data as { updated?: string[] } | null;
        if (!error && d?.updated?.includes('cover')) fixed++;
      } catch { /* item falhou: segue a fila */ }
      setProgress({ done: i + 1, total: queue.length, fixed });
    }
    toast.success(t('admin:queueDone', { fixed, total: queue.length }));
    setRunning(false);
    void refetch();
    void qc.invalidateQueries({ queryKey: ['artCoverage'] });
  }

  if (queue.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:queueTitle')}</div>
        <div className="card-sub">{t('admin:queueHint')}</div>
      </div>
      <ul className="art-queue">
        {queue.slice(0, 10).map((g) => (
          <li key={g.id} className="art-queue-item mono">
            <span className="art-queue-title">{g.title}</span>
            <span className="art-queue-plat">{(g.platforms ?? []).slice(0, 3).join(' ')}</span>
            <span className="art-queue-links">{t('admin:queueLinks', { count: Number(g.links) })}</span>
          </li>
        ))}
        {queue.length > 10 && (
          <li className="art-queue-item art-queue-more mono">+{queue.length - 10}…</li>
        )}
      </ul>
      <div className="admin-tools-row">
        <Button variant="primary" size="sm" onClick={() => void runBatch()} disabled={running}>
          {running ? <Spinner /> : <DownloadCloud />} {t('admin:queueRun', { count: queue.length })}
        </Button>
        {progress && (
          <span className="mono admin-tools-hint">
            {progress.done}/{progress.total} · {t('admin:queueFixed', { count: progress.fixed })}
          </span>
        )}
      </div>
    </Card>
  );
}

/* status fixo de cada integração (o que está no ar vs em obra) */
const INTEGRATIONS: { provider: string; label: string; state: 'ok' | 'beta' | 'soon' }[] = [
  { provider: 'steam', label: 'Steam', state: 'ok' },
  { provider: 'retroachievements', label: 'RetroAchievements', state: 'ok' },
  { provider: 'psn', label: 'PlayStation', state: 'ok' },
  { provider: 'xbox', label: 'Xbox', state: 'ok' },
  { provider: 'gog', label: 'GOG', state: 'ok' },
  { provider: 'nintendo', label: 'Nintendo', state: 'beta' },
  { provider: 'epic', label: 'Epic', state: 'soon' },
];

/** Status vivo das integrações: contas vinculadas + último sync por provedor. */
function IntegrationsPanel() {
  const { t } = useTranslation();
  const { data: rows = [] } = useQuery({
    queryKey: ['integrationsStatus'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('integrations_status');
      if (error) return [] as { provider: string; accounts: number; last_sync: string | null }[];
      return (data ?? []) as { provider: string; accounts: number; last_sync: string | null }[];
    },
  });
  const of = (p: string) => rows.find((r) => r.provider === p);
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:integTitle')}</div>
        <div className="card-sub">{t('admin:integHint')}</div>
      </div>
      <ul className="integ-list">
        {INTEGRATIONS.map((i) => {
          const live = of(i.provider);
          return (
            <li key={i.provider} className="integ-item mono">
              <span className={`integ-state integ-${i.state}`}>
                {t(`admin:integ_${i.state}`)}
              </span>
              <span className="integ-name">{i.label}</span>
              <span className="integ-meta">
                {live
                  ? `${t('admin:integAccounts', { count: Number(live.accounts) })}${live.last_sync ? ` · sync ${new Date(live.last_sync).toLocaleString()}` : ''}`
                  : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

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
      const d = data as { imported?: number; enriched?: number; skipped?: number; error?: string };
      if (d?.error) throw new Error(d.error);
      toast.success(t('admin:syncDone', { imported: d?.imported ?? 0, enriched: d?.enriched ?? 0, skipped: d?.skipped ?? 0 }));
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

      <ArtCoverage />
      <ArtQueue />
      <IntegrationsPanel />

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
