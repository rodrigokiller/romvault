import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { Trash2, ShieldAlert, Database as DbIcon, DownloadCloud, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { Input, Textarea } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { EmptyState, LoadingPage, Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { getSupabase } from '@/lib/supabase';
import { invokeFn } from '@/lib/invokeFn';
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

/** Status vivo das integrações: contas + último sync (alerta quando >48h). */
function IntegrationsPanel() {
  const { t } = useTranslation();
  const STALE_MS = 48 * 3_600_000;
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
  const { data: digestLast } = useQuery({
    queryKey: ['digestLast'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await db().rpc('digest_last');
      return (data as string | null) ?? null;
    },
  });
  const of = (p: string) => rows.find((r) => r.provider === p);
  const isStale = (last: string | null | undefined, hasUsers: boolean) =>
    hasUsers && (!last || Date.now() - new Date(last).getTime() > STALE_MS);
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:integTitle')}</div>
        <div className="card-sub">{t('admin:integHint')}</div>
      </div>
      <ul className="integ-list">
        {INTEGRATIONS.map((i) => {
          const live = of(i.provider);
          const stale = i.state === 'ok' && isStale(live?.last_sync, Number(live?.accounts ?? 0) > 0);
          return (
            <li key={i.provider} className={`integ-item mono ${stale ? 'integ-stale' : ''}`}>
              <span className={`integ-state integ-${stale ? 'stale' : i.state}`}>
                {stale ? t('admin:integ_stale') : t(`admin:integ_${i.state}`)}
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
        <li className={`integ-item mono ${digestLast && Date.now() - new Date(digestLast).getTime() > 8 * 86_400_000 ? 'integ-stale' : ''}`}>
          <span className="integ-state integ-ok">{t('admin:integ_ok')}</span>
          <span className="integ-name">backlog-digest</span>
          <span className="integ-meta">
            {digestLast ? `${t('admin:integDigestLast')} ${new Date(digestLast).toLocaleString()}` : t('admin:integDigestNever')}
          </span>
        </li>
      </ul>
    </Card>
  );
}

interface Report {
  id: string;
  subject_type: string;
  subject_label: string | null;
  subject_url: string | null;
  reason: string;
  note: string | null;
  created_at: string;
}

/** Fila de reportes da comunidade (arte/dados/match errados). */
function ReportsPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: reports = [] } = useQuery({
    queryKey: ['reports'],
    enabled: env.configured,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('reports')
        .select('id, subject_type, subject_label, subject_url, reason, note, created_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [] as Report[];
      return (data ?? []) as Report[];
    },
  });

  async function resolve(id: string) {
    const { error } = await db().from('reports')
      .update({ resolved_at: new Date().toISOString() }).eq('id', id);
    if (error) toast.error(t('forms:submitError'));
    else void qc.invalidateQueries({ queryKey: ['reports'] });
  }

  if (reports.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:reportsTitle', { count: reports.length })}</div>
        <div className="card-sub">{t('admin:reportsHint')}</div>
      </div>
      <ul className="integ-list">
        {reports.map((r) => (
          <li key={r.id} className="integ-item mono">
            <span className="integ-state integ-beta">{t(`report:r_${r.reason}`)}</span>
            <span className="integ-name" style={{ minWidth: 0, flex: 1 }}>
              {r.subject_url
                /* ?fix=1 abre a página com as ferramentas de admin já abertas */
                ? <a href={`${r.subject_url}?fix=1`} className="section-link">{r.subject_label ?? r.subject_url}</a>
                : (r.subject_label ?? r.subject_type)}
              {r.note && <span className="integ-meta"> · “{r.note}”</span>}
            </span>
            <span className="integ-meta">{new Date(r.created_at).toLocaleDateString()}</span>
            <Button size="sm" variant="ghost" onClick={() => void resolve(r.id)}>
              {t('admin:reportsResolve')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface IgdbHit {
  igdb_id: number;
  title: string;
  year: number | null;
  platforms: string[];
  thumb: string | null;
}

/** Adicionar UM jogo do IGDB (busca + importa) — o caminho pro Chrono de SNES. */
function AddGamePanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<IgdbHit[]>([]);
  const [busy, setBusy] = useState<number | 'search' | null>(null);

  async function search() {
    setBusy('search');
    try {
      const d = await invokeFn<{ results: IgdbHit[] }>('game-sync', { action: 'igdb-search', query: q.trim() });
      setResults(d.results ?? []);
      if ((d.results ?? []).length === 0) toast.error(t('admin:addNone', { q: q.trim() }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setBusy(null);
    }
  }

  async function add(hit: IgdbHit) {
    setBusy(hit.igdb_id);
    try {
      const d = await invokeFn<{ existed?: boolean; slug?: string }>('game-sync', { action: 'igdb-create', igdb_id: hit.igdb_id });
      toast.success(d.existed ? t('admin:addExisted', { slug: d.slug ?? '' }) : t('admin:addCreated', { title: hit.title }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:addTitle')}</div>
        <div className="card-sub">{t('admin:addHint')}</div>
      </div>
      <div className="admin-tools-row">
        <Input
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) void search(); }}
          placeholder={t('admin:addPh')} aria-label={t('admin:addTitle')}
        />
        <Button variant="primary" size="sm" disabled={busy !== null || !q.trim()} onClick={() => void search()}>
          {busy === 'search' ? <Spinner /> : <DownloadCloud />} {t('admin:addSearch')}
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="art-queue">
          {results.map((r) => (
            <li key={r.igdb_id} className="art-queue-item mono">
              {r.thumb && <img src={r.thumb} alt="" className="add-thumb" loading="lazy" />}
              <span className="art-queue-title">{r.title}{r.year ? ` (${r.year})` : ''}</span>
              <span className="art-queue-plat">{r.platforms.slice(0, 5).join(' ')}</span>
              <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void add(r)}>
                {busy === r.igdb_id ? <Spinner /> : t('admin:addBtn')}
              </Button>
            </li>
          ))}
        </ul>
      )}
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
  const [progress, setProgress] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function invokeOnce(plat: string, lim: number, pgs: number) {
    const { data, error } = await getSupabase().functions.invoke('igdb-sync', {
      body: { platform: plat, limit: lim, pages: pgs },
    });
    if (error) throw error;
    const d = data as { imported?: number; enriched?: number; skipped_dupe?: number; skipped?: number; failed?: number; error?: string };
    if (d?.error) throw new Error(d.error);
    return d;
  }

  async function run() {
    setRunning(true);
    try {
      const d = await invokeOnce(platform, limit, pages);
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

  /**
   * FULL de uma plataforma: repete lotes de 500x20 até a API secar (o cursor
   * fica no sync_state, então cada chamada continua de onde a anterior parou).
   */
  async function runPlatformFull(plat: string): Promise<number> {
    let total = 0;
    for (let round = 1; round <= 40; round++) {
      if (stopRef.current) break;
      setProgress(`${plat}: lote ${round} (${total} importados)…`);
      const d = await invokeOnce(plat, 500, 20);
      const moved = (d.imported ?? 0) + (d.skipped_dupe ?? d.skipped ?? 0) + (d.failed ?? 0);
      total += d.imported ?? 0;
      if (moved === 0) break; // plataforma esgotada
    }
    return total;
  }

  async function runFull(allPlatforms: boolean) {
    setRunning(true);
    stopRef.current = false;
    try {
      const plats = allPlatforms ? IGDB_PLATFORMS : [platform];
      let grand = 0;
      for (const p of plats) {
        if (stopRef.current) break;
        grand += await runPlatformFull(p);
      }
      toast.success(t('admin:syncFullDone', { count: grand }));
      void qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setRunning(false);
      setProgress(null);
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
        <Button variant="secondary" onClick={() => void runFull(false)} disabled={running} title={t('admin:syncFullPlatHint')}>
          {t('admin:syncFullPlat')}
        </Button>
        <Button variant="secondary" onClick={() => void runFull(true)} disabled={running} title={t('admin:syncFullAllHint')}>
          {t('admin:syncFullAll')}
        </Button>
        {running && progress && (
          <Button variant="ghost" size="sm" onClick={() => { stopRef.current = true; }}>
            {t('admin:syncStop')}
          </Button>
        )}
      </div>
      {progress && <p className="field-hint mono">{progress}</p>}
      <p className="field-hint">{t('admin:syncNote')}</p>
    </Card>
  );
}

/** Últimas rodadas de JOBS (imports CLI, crons de sync, digest). */
function JobsPanel() {
  const { t } = useTranslation();
  const { data: runs = [] } = useQuery({
    queryKey: ['jobRuns'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('job_runs')
        .select('id, job, mode, ok, stats, finished_at')
        .order('finished_at', { ascending: false })
        .limit(30);
      if (error) return [] as { id: string; job: string; mode: string | null; ok: boolean; stats: Record<string, unknown>; finished_at: string }[];
      return (data ?? []) as { id: string; job: string; mode: string | null; ok: boolean; stats: Record<string, unknown>; finished_at: string }[];
    },
  });
  if (runs.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:jobsTitle')}</div>
        <div className="card-sub">{t('admin:jobsHint')}</div>
      </div>
      <ul className="integ-list">
        {runs.map((r) => (
          <li key={r.id} className={`integ-item mono ${r.ok ? '' : 'integ-stale'}`}>
            <span className={`integ-state ${r.ok ? 'integ-ok' : 'integ-stale'}`}>
              {r.ok ? 'ok' : 'ERRO'}
            </span>
            <span className="integ-name">{r.job}{r.mode ? ` (${r.mode})` : ''}</span>
            <span className="integ-meta" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {Object.entries(r.stats ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(' · ') || '—'}
            </span>
            <span className="integ-meta">{new Date(r.finished_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Agendamentos VIVOS (cron.job) + último resultado de cada um (job_runs). */
function CronsPanel() {
  const { t } = useTranslation();
  const { data: jobs = [] } = useQuery({
    queryKey: ['cronJobs'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('cron_jobs_admin');
      if (error) return [] as { jobname: string; schedule: string; active: boolean }[];
      return (data ?? []) as { jobname: string; schedule: string; active: boolean }[];
    },
  });
  const { data: runs = [] } = useQuery({
    queryKey: ['cronLastRuns'],
    enabled: env.configured && jobs.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // SÓ rodadas de cron: runs da CLI ('igdb (cli)') confundiam o painel
      // (igdb-backfill aparecia como rodada do igdb-sync-switch)
      const { data, error } = await db()
        .from('job_runs').select('job, ok, finished_at')
        .eq('mode', 'cron')
        .order('finished_at', { ascending: false }).limit(100);
      if (error) return [] as { job: string; ok: boolean; finished_at: string }[];
      return (data ?? []) as { job: string; ok: boolean; finished_at: string }[];
    },
  });
  // 'steam-sync' -> última rodada de CRON cujo job começa com 'steam'
  const lastOf = (jobname: string) => {
    const prefix = jobname.split('-')[0];
    return runs.find((r) => r.job.startsWith(prefix)) ?? null;
  };
  // só estes jobs REGISTRAM job_runs (os SQL-puros como game-relevance não).
  // Nunca rodou = "aguardando 1ª rodada" (âmbar neutro); já rodou e sumiu por
  // 48h = MUDO (secret errada, function fora...)
  const LOGGING_PREFIXES = ['steam', 'psn', 'xbox', 'gog', 'ra', 'backlog', 'admin', 'nintendo'];
  const logs = (jobname: string) => LOGGING_PREFIXES.includes(jobname.split('-')[0]);
  if (jobs.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:cronsTitle')}</div>
        <div className="card-sub">{t('admin:cronsHint')}</div>
      </div>
      <ul className="integ-list">
        {jobs.map((j) => {
          const last = logs(j.jobname) ? lastOf(j.jobname) : null;
          const mute = j.active && logs(j.jobname) && last !== null
            && Date.now() - new Date(last.finished_at).getTime() > 48 * 3_600_000;
          const waiting = j.active && logs(j.jobname) && last === null;
          return (
            <li key={j.jobname} className={`integ-item mono ${j.active && !mute ? '' : 'integ-stale'}`}>
              <span className={`integ-state ${!j.active || mute ? 'integ-stale' : waiting ? 'integ-beta' : 'integ-ok'}`}>
                {!j.active ? 'OFF' : mute ? 'MUDO' : waiting ? '1ª...' : 'on'}
              </span>
              <span className="integ-name">{j.jobname}</span>
              <span className="integ-meta">{j.schedule}</span>
              <span className="integ-meta" style={{ flex: 1, textAlign: 'right' }} title={mute ? t('admin:cronMuteHint') : waiting ? t('admin:cronWaitingHint') : undefined}>
                {last
                  ? `${last.ok ? 'ok' : 'ERRO'} · ${new Date(last.finished_at).toLocaleString()}`
                  : logs(j.jobname) ? t('admin:cronsWaiting') : t('admin:cronsNoRun')}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Pós-backfill: as maiores FAMÍLIAS de versões ligadas (validação amostral). */
function FamiliesPanel() {
  const { t } = useTranslation();
  const { data: fams = [] } = useQuery({
    queryKey: ['relationFamilies'],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('relation_families', { lim: 10 });
      if (error) return [] as { base_id: string; base_title: string; base_slug: string; members: number; sample: { title: string; relation: string }[] }[];
      return (data ?? []) as { base_id: string; base_title: string; base_slug: string; members: number; sample: { title: string; relation: string }[] }[];
    },
  });
  if (fams.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:familiesTitle')}</div>
        <div className="card-sub">{t('admin:familiesHint')}</div>
      </div>
      <ul className="integ-list">
        {fams.map((f) => (
          <li key={f.base_id} className="integ-item mono">
            <span className="integ-name">
              <Link to={`/games/${f.base_slug}`} className="section-link">{f.base_title}</Link>
            </span>
            <span className="integ-meta">{t('admin:familiesCount', { count: Number(f.members) })}</span>
            <span className="integ-meta" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(f.sample ?? []).map((s) => s.title).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * FILA DE VINCULAÇÃO (fase 2 nasce com trabalho listado): jogos criados por
 * sync sem igdb_id (candidatos a vincular/merge), pares de título idêntico em
 * plataformas diferentes sem relação (candidatos a link), aliases de
 * plataforma/gênero desconhecidos e misses recentes dos syncs.
 */
function LinkQueuePanel() {
  const { t } = useTranslation();
  const { data: noIgdb = [] } = useQuery({
    queryKey: ['queueNoIgdb'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('games').select('id, title, slug, platforms, data_source')
        .is('igdb_id', null)
        .in('data_source', ['steam', 'gog', 'psn', 'xbox', 'nintendo'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) return [] as { id: string; title: string; slug: string; platforms: string[] | null; data_source: string }[];
      return (data ?? []) as { id: string; title: string; slug: string; platforms: string[] | null; data_source: string }[];
    },
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ['queueLinkCandidates'],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('link_candidates', { lim: 20 });
      if (error) return [] as { title: string; ids: string[]; slugs: string[]; platforms: string[] }[];
      return (data ?? []) as { title: string; ids: string[]; slugs: string[]; platforms: string[] }[];
    },
  });
  const { data: aliases = [] } = useQuery({
    queryKey: ['queueAliases'],
    enabled: env.configured,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('alias_pending').select('source, kind, external_key, context')
        .order('first_seen', { ascending: false }).limit(20);
      if (error) return [] as { source: string; kind: string; external_key: string; context: string | null }[];
      return (data ?? []) as { source: string; kind: string; external_key: string; context: string | null }[];
    },
  });
  // canônicos pro cadastro inline de alias (fecha o ciclo sem SQL manual)
  const { data: platformOpts = [] } = useQuery({
    queryKey: ['platformsAll'],
    enabled: env.configured && aliases.some((a) => a.kind === 'platform'),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await db().from('platforms').select('slug, name').order('sort');
      return (data ?? []) as { slug: string; name: string }[];
    },
  });
  const { data: genreOpts = [] } = useQuery({
    queryKey: ['genresAll'],
    enabled: env.configured && aliases.some((a) => a.kind === 'genre'),
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await db().from('genres').select('slug, name').order('name');
      return (data ?? []) as { slug: string; name: string }[];
    },
  });

  /** Grava o alias no de->para certo e tira da fila. */
  async function registerAlias(a: { source: string; kind: string; external_key: string }, canonical: string) {
    try {
      const table = a.kind === 'platform' ? 'platform_aliases' : 'genre_aliases';
      const col = a.kind === 'platform' ? 'platform' : 'genre';
      const { error } = await db().from(table)
        .upsert({ source: a.source, external_key: a.external_key, [col]: canonical }, { onConflict: 'source,external_key', ignoreDuplicates: false });
      if (error) throw error;
      await db().from('alias_pending').delete()
        .eq('source', a.source).eq('kind', a.kind).eq('external_key', a.external_key);
      toast.success(t('admin:aliasSaved', { alias: a.external_key }));
      void qc.invalidateQueries({ queryKey: ['queueAliases'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }
  const { data: missRuns = [] } = useQuery({
    queryKey: ['queueMisses'],
    enabled: env.configured,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db()
        .from('job_runs').select('id, job, stats, finished_at')
        .like('job', '%-sync-misses')
        .order('finished_at', { ascending: false }).limit(6);
      if (error) return [] as { id: string; job: string; stats: { unmatched?: number; sample?: string[] }; finished_at: string }[];
      return (data ?? []) as { id: string; job: string; stats: { unmatched?: number; sample?: string[] }; finished_at: string }[];
    },
  });

  const toast = useToast();
  const qc = useQueryClient();
  const [sendingDigest, setSendingDigest] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  async function sendDigest() {
    setSendingDigest(true);
    try {
      const d = await invokeFn<{ sent?: number; note?: string }>('admin-digest', {});
      toast.success(d?.note ?? t('admin:digestSent', { count: d?.sent ?? 0 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setSendingDigest(false);
    }
  }

  /**
   * Vincula os candidatos SEM AMBIGUIDADE: grupos de título idêntico onde
   * exatamente UM jogo tem igdb_id — os outros viram version_of dele.
   * Sobram na fila só os casos que merecem olho humano.
   */
  async function autoLink() {
    setAutoLinking(true);
    try {
      const { data, error } = await db().rpc('link_candidates', { lim: 200 });
      if (error) throw error;
      const grupos = (data ?? []) as { title: string; ids: string[] }[];
      const allIds = [...new Set(grupos.flatMap((g) => g.ids))];
      const igdbOf = new Map<string, number | null>();
      for (let i = 0; i < allIds.length; i += 200) {
        const { data: gs } = await db().from('games').select('id, igdb_id').in('id', allIds.slice(i, i + 200));
        for (const g of (gs ?? []) as { id: string; igdb_id: number | null }[]) igdbOf.set(g.id, g.igdb_id);
      }
      const rows: { game_id: string; related_id: string; relation: string; source: string }[] = [];
      for (const g of grupos) {
        const withIgdb = g.ids.filter((id) => igdbOf.get(id) != null);
        if (withIgdb.length !== 1) continue; // ambíguo (2+ com igdb) ou nenhum: fica pra revisão
        const canon = withIgdb[0];
        for (const id of g.ids) {
          if (id !== canon) rows.push({ game_id: id, related_id: canon, relation: 'version_of', source: 'auto' });
        }
      }
      if (rows.length === 0) { toast.success(t('admin:autoLinkNone')); return; }
      for (let i = 0; i < rows.length; i += 200) {
        const { error: upErr } = await db().from('game_relations')
          .upsert(rows.slice(i, i + 200), { onConflict: 'game_id,related_id', ignoreDuplicates: true });
        if (upErr) throw upErr;
      }
      toast.success(t('admin:autoLinkDone', { count: rows.length }));
      // atualiza TUDO que a rodada mexeu (a lista não "congelava" mais)
      void qc.invalidateQueries({ queryKey: ['queueLinkCandidates'] });
      void qc.invalidateQueries({ queryKey: ['queueNoIgdb'] });
      void qc.invalidateQueries({ queryKey: ['relationFamilies'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setAutoLinking(false);
    }
  }

  if (noIgdb.length === 0 && candidates.length === 0 && aliases.length === 0 && missRuns.length === 0) return null;
  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s3)' }}>
        <div>
          <div className="card-title">{t('admin:queueTitle')}</div>
          <div className="card-sub">{t('admin:queueHint')}</div>
        </div>
        <span style={{ display: 'flex', gap: 'var(--s2)', flexShrink: 0 }}>
          <Button variant="secondary" size="sm" onClick={() => void autoLink()} disabled={autoLinking}>
            {autoLinking ? <Spinner /> : t('admin:autoLinkNow')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void sendDigest()} disabled={sendingDigest}>
            {sendingDigest ? <Spinner /> : t('admin:digestNow')}
          </Button>
        </span>
      </div>

      {noIgdb.length > 0 && (
        <div>
          <span className="kicker">// {t('admin:queueNoIgdb', { count: noIgdb.length })}</span>
          <ul className="integ-list">
            {noIgdb.map((g) => (
              <li key={g.id} className="integ-item mono">
                <span className="integ-name">
                  <Link to={`/games/${g.slug}`} className="section-link">{g.title}</Link>
                </span>
                <span className="integ-meta">{(g.platforms ?? []).join(', ')} · {g.data_source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {candidates.length > 0 && (
        <div>
          <span className="kicker">// {t('admin:queueCandidates', { count: candidates.length })}</span>
          <ul className="integ-list">
            {candidates.map((cd) => (
              <li key={cd.title} className="integ-item mono">
                <span className="integ-name">{cd.title}</span>
                <span className="integ-meta" style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
                  {cd.slugs.map((s, i) => (
                    <Link key={s} to={`/games/${s}`} className="section-link">{cd.platforms[i] ?? '?'}</Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aliases.length > 0 && (
        <div>
          <span className="kicker">// {t('admin:queueAliases', { count: aliases.length })}</span>
          <ul className="integ-list">
            {aliases.map((a) => (
              <li key={`${a.source}-${a.kind}-${a.external_key}`} className="integ-item mono">
                <span className="integ-name">{a.external_key}</span>
                <span className="integ-meta">{a.source} · {a.kind}{a.context ? ` · ${a.context}` : ''}</span>
                <Select
                  aria-label={t('admin:aliasPick')}
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) void registerAlias(a, e.target.value); }}
                  style={{ maxWidth: 180 }}
                >
                  <option value="">{t('admin:aliasPick')}</option>
                  {(a.kind === 'platform' ? platformOpts : genreOpts).map((o) => (
                    <option key={o.slug} value={o.slug}>{o.name}</option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missRuns.length > 0 && (
        <div>
          <span className="kicker">// {t('admin:queueMisses')}</span>
          <ul className="integ-list">
            {missRuns.map((r) => (
              <li key={r.id} className="integ-item mono">
                <span className="integ-name">{r.job.replace('-sync-misses', '')}</span>
                <span className="integ-meta" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.stats.unmatched ?? 0} · {(r.stats.sample ?? []).slice(0, 5).join(' · ')}
                </span>
                <span className="integ-meta">{new Date(r.finished_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Convites do beta: gerar códigos e acompanhar usos. */
function InvitesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: me } = useMyProfile();
  const { data: invites = [] } = useQuery({
    queryKey: ['invites'],
    enabled: env.configured,
    queryFn: async () => {
      const { data, error } = await db()
        .from('invites').select('code, max_uses, uses, created_at')
        .order('created_at', { ascending: false }).limit(30);
      if (error) return [] as { code: string; max_uses: number; uses: number; created_at: string }[];
      return (data ?? []) as { code: string; max_uses: number; uses: number; created_at: string }[];
    },
  });

  async function create(maxUses: number) {
    const code = `RV-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { error } = await db().from('invites').insert({ code, created_by: me?.id, max_uses: maxUses });
    if (error) toast.error(error.message);
    else {
      void navigator.clipboard.writeText(code).catch(() => {});
      toast.success(t('admin:inviteCreated', { code }));
      void qc.invalidateQueries({ queryKey: ['invites'] });
    }
  }

  return (
    <Card className="settings-section" style={{ marginTop: 'var(--s5)' }}>
      <div>
        <div className="card-title">{t('admin:invitesTitle')}</div>
        <div className="card-sub">{t('admin:invitesHint')}</div>
      </div>
      <div className="admin-tools-row">
        <Button size="sm" variant="primary" onClick={() => void create(1)}>{t('admin:inviteNew1')}</Button>
        <Button size="sm" variant="secondary" onClick={() => void create(5)}>{t('admin:inviteNew5')}</Button>
      </div>
      {invites.length > 0 && (
        <ul className="integ-list">
          {invites.map((i) => (
            <li key={i.code} className="integ-item mono">
              <span className="integ-name">{i.code}</span>
              <span className="integ-meta">{i.uses}/{i.max_uses} · {new Date(i.created_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const TABLES = ['games', 'romhacks', 'translations', 'documents', 'tools', 'articles'] as const;
type AdminTable = (typeof TABLES)[number];

interface AdminRow { id: string; title: string; created_at: string }

function useAdminList(table: AdminTable, search: string) {
  return useQuery({
    queryKey: ['admin', table, search],
    enabled: env.configured,
    queryFn: async (): Promise<AdminRow[]> => {
      let q = db()
        .from(table)
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (search.trim()) q = q.ilike('title', `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AdminRow[];
    },
  });
}

/** Campos editáveis por tabela (o "edit estilo banco" pedido pelo Killer). */
const EDIT_FIELDS: Record<AdminTable, { key: string; label: string; kind: 'text' | 'textarea' | 'csv' | 'number' }[]> = {
  games: [
    { key: 'title', label: 'title', kind: 'text' },
    { key: 'slug', label: 'slug', kind: 'text' },
    { key: 'igdb_id', label: 'igdb_id', kind: 'number' },
    { key: 'game_type', label: 'game_type', kind: 'text' },
    { key: 'platforms', label: 'platforms (a,b,c)', kind: 'csv' },
    { key: 'genres', label: 'genres (a,b,c)', kind: 'csv' },
    { key: 'series', label: 'series', kind: 'text' },
    { key: 'franchise', label: 'franchise', kind: 'text' },
    { key: 'release_date', label: 'release_date (aaaa-mm-dd)', kind: 'text' },
    { key: 'cover_url', label: 'cover_url', kind: 'text' },
    { key: 'description', label: 'description', kind: 'textarea' },
  ],
  romhacks: [
    { key: 'title', label: 'title', kind: 'text' },
    { key: 'version', label: 'version', kind: 'text' },
    { key: 'file_url', label: 'file_url', kind: 'text' },
    { key: 'source_url', label: 'source_url', kind: 'text' },
    { key: 'thumbnail', label: 'thumbnail', kind: 'text' },
    { key: 'video_url', label: 'video_url', kind: 'text' },
    { key: 'description', label: 'description', kind: 'textarea' },
  ],
  translations: [
    { key: 'title', label: 'title', kind: 'text' },
    { key: 'language', label: 'language', kind: 'text' },
    { key: 'version', label: 'version', kind: 'text' },
    { key: 'file_url', label: 'file_url', kind: 'text' },
    { key: 'source_url', label: 'source_url', kind: 'text' },
    { key: 'thumbnail', label: 'thumbnail', kind: 'text' },
    { key: 'video_url', label: 'video_url', kind: 'text' },
    { key: 'description', label: 'description', kind: 'textarea' },
  ],
  documents: [
    { key: 'title', label: 'title', kind: 'text' },
    { key: 'category', label: 'category', kind: 'text' },
    { key: 'language', label: 'language', kind: 'text' },
    { key: 'file_url', label: 'file_url', kind: 'text' },
    { key: 'source_url', label: 'source_url', kind: 'text' },
    { key: 'description', label: 'description', kind: 'textarea' },
  ],
  tools: [
    { key: 'title', label: 'title', kind: 'text' },
    { key: 'category', label: 'category', kind: 'text' },
    { key: 'version', label: 'version', kind: 'text' },
    { key: 'file_url', label: 'file_url', kind: 'text' },
    { key: 'source_code_url', label: 'source_code_url', kind: 'text' },
    { key: 'thumbnail', label: 'thumbnail', kind: 'text' },
    { key: 'description', label: 'description', kind: 'textarea' },
  ],
  articles: [
    { key: 'title', label: 'title', kind: 'text' },
    { key: 'slug', label: 'slug', kind: 'text' },
    { key: 'excerpt', label: 'excerpt', kind: 'textarea' },
  ],
};

/** Modal de edição crua (chave-valor) de uma linha — requer migration 39. */
function EditRowDialog({ table, rowId, onClose }: { table: AdminTable; rowId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const fields = EDIT_FIELDS[table];
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: row } = useQuery({
    queryKey: ['adminEdit', table, rowId],
    queryFn: async () => {
      const { data, error } = await db().from(table)
        .select(fields.map((f) => f.key).join(', ')).eq('id', rowId).maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Record<string, unknown>;
    },
  });
  useEffect(() => {
    if (row && !form) {
      const init: Record<string, string> = {};
      for (const f of fields) {
        const v = row[f.key];
        init[f.key] = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
      }
      setForm(init);
    }
  }, [row, form, fields]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const f of fields) {
        const raw = form[f.key].trim();
        if (f.kind === 'csv') patch[f.key] = raw ? raw.split(',').map((x) => x.trim()).filter(Boolean) : [];
        else if (f.kind === 'number') patch[f.key] = raw ? Number(raw) : null;
        else patch[f.key] = raw || null;
      }
      const { error } = await db().from(table).update(patch).eq('id', rowId);
      if (error) throw error;
      toast.success(t('admin:editSaved'));
      void qc.invalidateQueries({ queryKey: ['admin', table] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`${table} · ${t('admin:editTitle')}`}>
      {!form ? <Spinner /> : (
        <div style={{ display: 'grid', gap: 'var(--s3)', maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {(id) => f.kind === 'textarea'
                ? <Textarea id={id} rows={3} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                : <Input id={id} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
            </Field>
          ))}
          <div className="submit-actions">
            <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? <Spinner /> : t('admin:editSave')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* Guias do admin: a página tinha virado um paredão de 11 painéis empilhados */
const ADMIN_TABS = ['curadoria', 'catalogo', 'infra', 'dados', 'comunidade'] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

export function Admin() {
  const { t } = useTranslation();
  const toast = useToast();
  const { isLoading: profileLoading } = useMyProfile();
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<AdminTab>('curadoria');
  const [table, setTable] = useState<AdminTable>('games');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(20);
  const [editing, setEditing] = useState<string | null>(null);
  const list = useAdminList(table, search);
  const del = useDeleteEntity();

  // trocar de tabela volta pros primeiros 20 e limpa a busca
  useEffect(() => { setVisible(20); setSearch(''); }, [table]);
  useEffect(() => { setVisible(20); }, [search]);

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
        {ADMIN_TABS.map((tb) => (
          <button
            key={tb} type="button" role="tab" aria-selected={tab === tb}
            className={`type-seg-btn ${tab === tb ? 'is-active' : ''}`}
            onClick={() => setTab(tb)}
          >
            {t(`admin:tab_${tb}`)}
          </button>
        ))}
      </div>

      {tab === 'curadoria' && (
        <>
          <ReportsPanel />
          <LinkQueuePanel />
          <FamiliesPanel />
        </>
      )}

      {tab === 'catalogo' && (
        <>
          <ArtCoverage />
          <AddGamePanel />
          <ArtQueue />
          <IgdbSyncPanel />
        </>
      )}

      {tab === 'infra' && (
        <>
          <IntegrationsPanel />
          <CronsPanel />
          <JobsPanel />
        </>
      )}

      {tab === 'comunidade' && <InvitesPanel />}

      {tab === 'dados' && (
        <>
          <div className="type-seg" role="tablist" style={{ marginTop: 'var(--s5)' }}>
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

          <div className="filter-bar" style={{ marginTop: 'var(--s3)' }}>
            <Field label={t('browse:searchPlaceholder')}>
              {(id) => (
                <Input
                  id={id} type="search" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('admin:dataSearchPh')}
                />
              )}
            </Field>
            {rows.length > 0 && (
              <span className="filter-count">{t('browse:results', { count: rows.length })}</span>
            )}
          </div>

          {list.isLoading ? (
            <LoadingPage />
          ) : rows.length === 0 ? (
            <EmptyState icon={DbIcon} title={t('browse:emptyTitle')} />
          ) : (
            <>
              {/* mostra 20 por vez: a página não vira um paredão */}
              <div className="admin-table">
                {rows.slice(0, visible).map((row) => (
                  <div key={row.id} className="admin-row">
                    <span className="admin-row-title">{row.title}</span>
                    <span className="admin-row-date mono">{new Date(row.created_at).toLocaleDateString()}</span>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(row.id)}>
                      <Pencil /> {t('admin:edit')}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => void remove(row)} disabled={del.isPending}>
                      <Trash2 /> {t('admin:delete')}
                    </Button>
                  </div>
                ))}
              </div>
              {rows.length > visible && (
                <div style={{ marginTop: 'var(--s3)', textAlign: 'center' }}>
                  <Button variant="secondary" size="sm" onClick={() => setVisible((v) => v + 20)}>
                    {t('browse:loadMore')} ({rows.length - visible})
                  </Button>
                </div>
              )}
            </>
          )}
          {editing && <EditRowDialog table={table} rowId={editing} onClose={() => setEditing(null)} />}
        </>
      )}
    </div>
  );
}
