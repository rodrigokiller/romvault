import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FileUp, Upload } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import type { TrackStatus } from '@/hooks/useTracks';

const db = () => getSupabase() as unknown as SupabaseClient;

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Parser de CSV simples com suporte a aspas (linhas x colunas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** Mapeia status de outros trackers (Backloggd/HLTB/planilha) pros nossos. */
function mapStatus(raw: string): TrackStatus {
  const s = norm(raw);
  if (/(finish|complet|beaten|zerad|termin|mastered|100)/.test(s)) return 'finished';
  if (/(abandon|drop|shelv|desist)/.test(s)) return 'abandoned';
  if (/(play|jogando|progress)/.test(s)) return 'playing';
  if (/(own|colec|guard|have)/.test(s)) return 'owned';
  return 'backlog'; // backlog / wishlist / want / vazio
}

interface ParsedRow {
  title: string;
  platform: string | null;
  status: TrackStatus;
  hours: number | null;
}

/** Detecta as colunas pelo cabeçalho e extrai as linhas úteis. */
function extract(rows: string[][]): ParsedRow[] {
  if (rows.length === 0) return [];
  const head = rows[0].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iTitle = col('title', 'game', 'name', 'jogo', 'nome');
  const iPlat = col('platform', 'plataforma', 'system', 'console');
  const iStatus = col('status', 'estado');
  const iHours = col('hour', 'hora', 'time played', 'playtime', 'tempo');
  const hasHeader = iTitle >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  const ti = hasHeader ? iTitle : 0;
  return body
    .map((r) => ({
      title: (r[ti] ?? '').trim(),
      platform: iPlat >= 0 ? (r[iPlat] ?? '').trim() || null : null,
      status: mapStatus(iStatus >= 0 ? r[iStatus] ?? '' : ''),
      hours: iHours >= 0 && r[iHours] ? Number(String(r[iHours]).replace(',', '.')) || null : null,
    }))
    .filter((r) => r.title);
}

/**
 * Importar arquivo (CSV genérico, export do Backloggd/HLTB): cola ou anexa,
 * casa por título(+plataforma) com o catálogo e adiciona à biblioteca —
 * nunca sobrescreve o que já existe.
 */
export function ImportFile() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function onFile(f: File | undefined) {
    if (!f) return;
    setText(await f.text());
  }

  async function run() {
    const parsed = extract(parseCsv(text));
    if (parsed.length === 0) { toast.error(t('library:importNone')); return; }
    setRunning(true);
    try {
      // índice do catálogo (paginado): título+plataforma > título
      setProgress(t('library:importIndexing'));
      const byKey = new Map<string, string>();
      const byTitle = new Map<string, string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db().from('games')
          .select('id, title, platforms').range(from, from + 999);
        if (error) throw error;
        for (const g of (data ?? []) as { id: string; title: string; platforms: string[] | null }[]) {
          const k = norm(g.title);
          if (!byTitle.has(k)) byTitle.set(k, g.id);
          for (const p of g.platforms ?? []) byKey.set(`${norm(p)}|${k}`, g.id);
        }
        if (!data || data.length < 1000) break;
      }

      const rows = new Map<string, Record<string, unknown>>();
      const misses: string[] = [];
      for (const r of parsed) {
        const k = norm(r.title);
        const gid = (r.platform && byKey.get(`${norm(r.platform)}|${k}`)) || byTitle.get(k);
        if (!gid) { misses.push(r.platform ? `${r.title} (${r.platform})` : r.title); continue; }
        rows.set(gid, {
          user_id: user!.id, game_id: gid, status: r.status,
          platform: r.platform, hours_played: r.hours, source: 'manual',
        });
      }
      const list = [...rows.values()];
      let added = 0;
      for (let i = 0; i < list.length; i += 200) {
        setProgress(`${Math.min(i + 200, list.length)}/${list.length}`);
        const { data } = await db().from('game_tracks')
          .upsert(list.slice(i, i + 200), { onConflict: 'user_id,game_id', ignoreDuplicates: true })
          .select('game_id');
        added += (data ?? []).length;
      }
      toast.success(t('library:importDone', { added, total: parsed.length, missed: misses.length }));
      if (misses.length > 0) {
        const blob = new Blob([misses.join('\n')], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'romvault-sem-match.txt';
        a.click();
        URL.revokeObjectURL(a.href);
      }
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['trackMap'] });
      setOpen(false);
      setText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setRunning(false);
      setProgress('');
    }
  }

  return (
    <>
      <button type="button" className="lib-stat lib-showcase" onClick={() => setOpen(true)}>
        <FileUp aria-hidden /> {t('library:importBtn')}
      </button>
      {open && (
        <Dialog open={open} onClose={() => setOpen(false)} title={t('library:importTitle')}>
          <p className="page-sub">{t('library:importText')}</p>
          <Textarea
            rows={8} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={t('library:importPh')}
          />
          <div className="submit-actions" style={{ marginTop: 'var(--s3)' }}>
            <input
              ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp /> {t('library:importFilePick')}
            </Button>
            <Button variant="primary" size="sm" disabled={running || !text.trim()} onClick={() => void run()}>
              {running ? <Spinner /> : <Upload />} {running && progress ? progress : t('library:importRun')}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
