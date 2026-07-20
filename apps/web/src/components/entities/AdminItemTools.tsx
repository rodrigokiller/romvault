import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Shield, RefreshCw, ImagePlus, Link2, Search, Clock3, Star, Combine, Zap } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
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

interface CatalogCandidate {
  id: string;
  title: string;
  slug: string;
  platforms: string[] | null;
  igdb_id: number | null;
  cover_url: string | null;
  thumbnail: string | null;
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

  // modal de MERGE/LIGAR (caso Starbound: página da Steam + registro IGDB)
  const navigate = useNavigate();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTerm, setMergeTerm] = useState(gameTitle ?? '');
  const [mergeResults, setMergeResults] = useState<CatalogCandidate[]>([]);
  const [mergeSearching, setMergeSearching] = useState(false);
  // "Sincronizar tudo": passo atual mostrado no botão
  const [syncStep, setSyncStep] = useState<string | null>(null);

  if (!isAdmin) return null;

  // "Sincronizar tudo": um clique roda IGDB + capas/mídia + HLTB + Metacritic
  // em sequência (funções separadas por baixo; UX de um botão só)
  async function syncAll() {
    setRunning(true);
    const done: string[] = [];
    const steps: [string, Record<string, unknown>][] = [
      ['IGDB', { game_id: gameId, action: 'igdb' }],
      [t('admin:igdbMediaBtn'), { game_id: gameId, action: 'igdb-media' }],
      ['HowLongToBeat', { game_id: gameId, action: 'hltb' }],
      ['Metacritic', { game_id: gameId, action: 'metacritic' }],
    ];
    for (const [label, body] of steps) {
      setSyncStep(label);
      try {
        await invokeFn('game-sync', body);
        done.push(label);
      } catch { /* uma fonte sem dado não derruba as outras */ }
    }
    setSyncStep(null);
    setRunning(false);
    void qc.invalidateQueries({ queryKey: ['game'] });
    void qc.invalidateQueries({ queryKey: ['games'] });
    void qc.invalidateQueries({ queryKey: ['gameMedia'] });
    void qc.invalidateQueries({ queryKey: ['gameVersions'] });
    if (done.length > 0) toast.success(t('admin:syncAllDone', { list: done.join(', ') }));
    else toast.error(t('forms:submitError'));
  }

  async function searchCatalog() {
    setMergeSearching(true);
    try {
      const sb = getSupabase() as unknown as SupabaseClient;
      // busca por TÍTULO ou TÍTULO ALTERNATIVO (o FF VI não aparecia porque
      // no catálogo o título é "Final Fantasy III" e o VI é um alt_title)
      const safe = mergeTerm.trim().replace(/[,()]/g, ' ');
      const { data } = await sb.from('games')
        .select('id, title, slug, platforms, igdb_id, cover_url, thumbnail')
        .or(`title.ilike.%${safe}%,alt_search.ilike.%${safe}%`)
        .neq('id', gameId)
        .order('relevance', { ascending: false })
        .limit(10);
      setMergeResults((data ?? []) as CatalogCandidate[]);
    } finally {
      setMergeSearching(false);
    }
  }

  /** Funde ESTE jogo dentro do alvo (server-side move tudo) e navega pro alvo. */
  async function mergeInto(target: CatalogCandidate, force = false) {
    if (!force && !window.confirm(t('admin:mergeConfirm', { target: target.title }))) return;
    setRunning(true);
    try {
      const d = await invokeFn<{ target_slug?: string; moved?: Record<string, number> }>('game-sync', {
        game_id: gameId, action: 'merge', target_id: target.id, ...(force ? { force: true } : {}),
      });
      toast.success(t('admin:mergeDone', { target: target.title }));
      setMergeOpen(false);
      if (d?.target_slug) navigate(`/games/${d.target_slug}`);
    } catch (err) {
      // igdb_ids diferentes: pergunta se força (um pode estar com igdb errado)
      const msg = err instanceof Error ? err.message : '';
      if (/igdb_id diferente/i.test(msg) && window.confirm(t('admin:mergeForceConfirm', { target: target.title }))) {
        setRunning(false);
        return mergeInto(target, true);
      }
      toast.error(msg || t('forms:submitError'));
    } finally {
      setRunning(false);
    }
  }

  /** Liga como versão (game_relations manual): jogos DISTINTOS que se conectam. */
  async function linkVersion(target: CatalogCandidate) {
    try {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { error } = await sb.from('game_relations')
        .upsert(
          { game_id: gameId, related_id: target.id, relation: 'version_of', source: 'manual' },
          { onConflict: 'game_id,related_id', ignoreDuplicates: true },
        );
      if (error) throw error;
      toast.success(t('admin:linkVersionDone', { target: target.title }));
      void qc.invalidateQueries({ queryKey: ['gameVersions'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

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
            {/* UM botão faz todo o sync (IGDB + mídia + HLTB + Metacritic) */}
            <Button
              variant="primary" disabled={running}
              onClick={() => void syncAll()}
            >
              {running && syncStep ? <><Spinner /> {syncStep}…</> : <><Zap /> {t('admin:syncAllBtn')}</>}
            </Button>
            <Button size="sm" variant="secondary" disabled={running} onClick={() => { setResults([]); setLinkOpen(true); }}>
              <Link2 /> {t('admin:linkBtn')}
            </Button>
            <Button
              size="sm" variant="secondary" disabled={running}
              title={t('admin:mergeHint')}
              onClick={() => { setMergeResults([]); setMergeOpen(true); }}
            >
              <Combine /> {t('admin:mergeBtn')}
            </Button>
          </div>
          {/* individuais: pra rodar uma fonte só quando precisa */}
          <details className="admin-tools-adv">
            <summary className="mono">{t('admin:advSources')}</summary>
            <div className="admin-tools-row">
              <Button
                size="sm" variant="ghost" disabled={running}
                onClick={() => void call({ game_id: gameId, action: 'igdb' }, t('admin:itemSynced'))}
              >
                <RefreshCw /> IGDB
              </Button>
              <Button
                size="sm" variant="ghost" disabled={running} title={t('admin:igdbMediaHint')}
                onClick={() => void call({ game_id: gameId, action: 'igdb-media' }, t('admin:igdbMediaDone'))}
              >
                <ImagePlus /> {t('admin:igdbMediaBtn')}
              </Button>
              <Button
                size="sm" variant="ghost" disabled={running} title={t('admin:hltbHint')}
                onClick={() => void call({ game_id: gameId, action: 'hltb' }, 'HLTB')}
              >
                <Clock3 /> HLTB
              </Button>
              <Button
                size="sm" variant="ghost" disabled={running} title={t('admin:metacriticHint')}
                onClick={() => void call({ game_id: gameId, action: 'metacritic' }, 'Metacritic')}
              >
                <Star /> Metacritic
              </Button>
            </div>
          </details>
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

      {/* modal de MERGE/LIGAR: busca no NOSSO catálogo e escolhe o destino */}
      {mergeOpen && (
        <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} title={t('admin:mergeTitle')}>
          <p className="page-sub">{t('admin:mergeText')}</p>
          <ul className="merge-legend">
            <li><Combine aria-hidden /> <b>{t('admin:mergeInto')}</b>: {t('admin:mergeLegendMerge')}</li>
            <li><Link2 aria-hidden /> <b>{t('admin:linkVersion')}</b>: {t('admin:mergeLegendLink')}</li>
          </ul>
          <div className="admin-tools-row" style={{ marginTop: 'var(--s3)' }}>
            <Input
              value={mergeTerm} onChange={(e) => setMergeTerm(e.target.value)}
              placeholder={t('admin:itemQueryPh')} aria-label={t('admin:itemQueryPh')}
              onKeyDown={(e) => { if (e.key === 'Enter') void searchCatalog(); }}
            />
            <Button size="sm" variant="primary" disabled={mergeSearching || !mergeTerm.trim()} onClick={() => void searchCatalog()}>
              {mergeSearching ? <Spinner /> : <Search />} {t('admin:addSearch')}
            </Button>
          </div>
          {mergeResults.length > 0 && (
            <ul className="link-results">
              {mergeResults.map((r) => (
                <li key={r.id} className="link-result">
                  <div className="link-result-thumb">
                    {r.cover_url || r.thumbnail
                      ? <img src={r.cover_url ?? r.thumbnail ?? ''} alt="" loading="lazy" />
                      : <span className="mono">?</span>}
                  </div>
                  <div className="link-result-body">
                    <span className="link-result-title">
                      {r.title}
                      {r.igdb_id ? <span className="link-result-id mono"> · igdb {r.igdb_id}</span> : null}
                    </span>
                    {(r.platforms ?? []).length > 0 && (
                      <span className="link-result-plats mono">{(r.platforms ?? []).slice(0, 6).join(' · ')}</span>
                    )}
                  </div>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
                    <Button size="sm" variant="primary" disabled={running} onClick={() => void mergeInto(r)}>
                      <Combine /> {t('admin:mergeInto')}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={running} onClick={() => void linkVersion(r)}>
                      <Link2 /> {t('admin:linkVersion')}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </div>
  );
}
