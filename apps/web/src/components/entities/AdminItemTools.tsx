import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, RefreshCw, ImagePlus, Link2, Search } from 'lucide-react';
import { invokeFn } from '@/lib/invokeFn';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/Toast';
import { useIsAdmin } from '@/hooks/useProfile';

interface IgdbCandidate {
  igdb_id: number;
  title: string;
  year: number | null;
  platforms: string[];
  thumb: string | null;
  summary: string | null;
}

/**
 * Ferramenta de admin NA PÁGINA do jogo (estilo trakt): re-sincroniza
 * metadados/arte do IGDB, VINCULA com o registro certo (modal estilo Plex:
 * busca por termo ou id, resultados com detalhes, escolhe e vincula) ou
 * define arte manual por URL — sem sair da página.
 */
export function AdminItemTools({ gameId, gameTitle, dataSource, updatedAt, igdbId }: {
  gameId: string;
  gameTitle?: string;
  dataSource?: string | null;
  updatedAt?: string | null;
  igdbId?: number | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  // ?fix=1 (link da fila de reportes) chega com a caixa já aberta
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).has('fix'));
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState<'cover_url' | 'boxart' | 'box3d'>('cover_url');
  const [url, setUrl] = useState('');

  // modal de vínculo (estilo Plex)
  const [linkOpen, setLinkOpen] = useState(false);
  const [term, setTerm] = useState(gameTitle ?? '');
  const [directId, setDirectId] = useState('');
  const [results, setResults] = useState<IgdbCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  if (!isAdmin) return null;

  async function call(body: Record<string, unknown>, okMsg: string) {
    setRunning(true);
    try {
      const d = await invokeFn<{ updated?: string[]; matched?: string; note?: string }>('game-sync', body);
      toast.success(d?.note ?? `${okMsg}${d?.updated?.length ? `: ${d.updated.join(', ')}` : ''}`);
      void qc.invalidateQueries({ queryKey: ['game'] });
      void qc.invalidateQueries({ queryKey: ['games'] });
      setUrl('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const notDeployed = /failed to send|fetch|networkerror/i.test(msg);
      toast.error(notDeployed ? t('settings:fnNotDeployed', { fn: 'game-sync' }) : (msg || t('forms:submitError')));
    } finally {
      setRunning(false);
    }
  }

  async function search() {
    setSearching(true);
    try {
      const id = Number(directId.trim()) || 0;
      const d = await invokeFn<{ results: IgdbCandidate[] }>('game-sync', {
        action: 'igdb-search',
        ...(id ? { igdb_id: id } : { query: term.trim() }),
      });
      setResults(d.results ?? []);
      if ((d.results ?? []).length === 0) toast.error(t('admin:linkNone'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally {
      setSearching(false);
    }
  }

  async function linkTo(candidate: IgdbCandidate) {
    await call({ game_id: gameId, action: 'igdb', igdb_id: candidate.igdb_id }, t('admin:linkDone', { title: candidate.title }));
    setLinkOpen(false);
  }

  return (
    <div className="admin-tools">
      <button type="button" className="admin-tools-toggle mono" onClick={() => setOpen((o) => !o)}>
        <Shield aria-hidden /> {t('admin:itemTools')}
      </button>
      {open && (
        <div className="admin-tools-body">
          {/* histórico: de onde veio e quando foi tocado pela última vez */}
          <span className="admin-tools-hint mono">
            {t('admin:itemSource')}: {dataSource ?? '?'}
            {igdbId ? ` · igdb_id ${igdbId}` : ` · ${t('admin:itemNoIgdb')}`}
            {updatedAt ? ` · ${t('admin:itemUpdated')} ${new Date(updatedAt).toLocaleDateString()}` : ''}
          </span>
          <div className="admin-tools-row">
            <Button
              size="sm" variant="secondary" disabled={running}
              onClick={() => void call({ game_id: gameId, action: 'igdb' }, t('admin:itemSynced'))}
            >
              {running ? <Spinner /> : <RefreshCw />} {t('admin:itemSyncIgdb')}
            </Button>
            <Button size="sm" variant="secondary" disabled={running} onClick={() => { setResults([]); setLinkOpen(true); }}>
              <Link2 /> {t('admin:linkBtn')}
            </Button>
          </div>
          <span className="admin-tools-hint">{t('admin:itemSyncHint')}</span>
          <div className="admin-tools-row">
            <Select value={target} onChange={(e) => setTarget(e.target.value as typeof target)} aria-label={t('admin:itemArtTarget')}>
              <option value="cover_url">{t('admin:art_cover')}</option>
              <option value="boxart">{t('admin:art_boxart')}</option>
              <option value="box3d">{t('admin:art_box3d')}</option>
            </Select>
            <Input
              value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={t('vitrine:artUrlPh')} aria-label={t('admin:itemArtTarget')}
            />
            <Button
              size="sm" variant="primary" disabled={running || !url.trim()}
              onClick={() => void call({ game_id: gameId, action: 'set-art', [target]: url.trim() }, t('admin:itemArtSet'))}
            >
              <ImagePlus /> {t('library:copyConfirm')}
            </Button>
          </div>
        </div>
      )}

      {/* modal de vínculo estilo Plex: busca -> candidatos com detalhes -> Vincular */}
      {linkOpen && (
        <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} title={t('admin:linkTitle')}>
          <p className="page-sub">{t('admin:linkText')}</p>
          <div className="admin-tools-row" style={{ marginTop: 'var(--s3)' }}>
            <Input
              value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder={t('admin:itemQueryPh')} aria-label={t('admin:itemQueryPh')}
              onKeyDown={(e) => { if (e.key === 'Enter') void search(); }}
            />
            <Input
              value={directId} onChange={(e) => setDirectId(e.target.value)}
              placeholder={t('admin:linkIdPh')} aria-label={t('admin:linkIdPh')}
              style={{ maxWidth: 140 }}
            />
            <Button size="sm" variant="primary" disabled={searching || (!term.trim() && !directId.trim())} onClick={() => void search()}>
              {searching ? <Spinner /> : <Search />} {t('admin:addSearch')}
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="link-results">
              {results.map((r) => (
                <li key={r.igdb_id} className="link-result">
                  <div className="link-result-thumb">
                    {r.thumb ? <img src={r.thumb} alt="" loading="lazy" /> : <span className="mono">?</span>}
                  </div>
                  <div className="link-result-body">
                    <span className="link-result-title">
                      {r.title}{r.year ? ` (${r.year})` : ''}
                      <span className="link-result-id mono"> · igdb {r.igdb_id}</span>
                    </span>
                    {r.platforms.length > 0 && (
                      <span className="link-result-plats mono">{r.platforms.slice(0, 6).join(' · ')}</span>
                    )}
                    {r.summary && <p className="link-result-summary">{r.summary}…</p>}
                  </div>
                  <Button size="sm" variant="primary" disabled={running} onClick={() => void linkTo(r)}>
                    <Link2 /> {t('admin:linkPick')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}
