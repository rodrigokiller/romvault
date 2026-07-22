import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Disc3, Plus, Search, Trash2, ChevronDown } from 'lucide-react';
import { invokeFn } from '@/lib/invokeFn';
import { useIsCurator } from '@/hooks/useProfile';
import { useSoundtracks, type Soundtrack, type Track } from '@/hooks/useSoundtracks';
import { useToast } from '@/components/ui/Toast';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/feedback';

/** tipos de álbum — 'inspired' é o caso "Music Inspired by The Witcher" */
const KINDS = ['original', 'arrange', 'vocal', 'remix', 'cover', 'piano', 'live', 'selection', 'inspired', 'other'] as const;

interface Candidate {
  mbid: string; title: string; artist: string | null;
  first_release: string | null; secondary_types: string[];
}
type PreviewTrack = { disc: number; position: number; title: string; duration_ms: number | null };
interface Release {
  id: string; date: string | null; country: string | null; script: string | null;
  language: string | null; disambiguation: string | null; tracks: number | null;
}
interface Preview { releases: Release[]; release_id: string; tracks: PreviewTrack[] }

/** "2021-11-06 · JP · 44 faixas" — o suficiente pra reconhecer a edição. */
const releaseLabel = (r: Release) => [
  r.date ?? '?', r.country ?? (r.script === 'Latn' ? 'latim' : r.script ?? '—'),
  r.tracks ? `${r.tracks} faixas` : null, r.disambiguation,
].filter(Boolean).join(' · ');

const mmss = (ms: number | null) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Um álbum: capa, dados e faixas (recolhidas por padrão). */
function AlbumCard({ album, tracks, canCurate, onRemove, onChangeEdition }: {
  album: Soundtrack; tracks: Track[]; canCurate: boolean;
  onRemove: (id: string) => void; onChangeEdition: (a: Soundtrack) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const year = album.release_date?.slice(0, 4);
  const mbid = album.external_ids?.musicbrainz;
  return (
    <article className="ost-card">
      <div className="ost-cover">
        {album.cover_url ? <img src={album.cover_url} alt={album.title} loading="lazy" /> : <Disc3 aria-hidden />}
      </div>
      <div className="ost-body">
        <div className="ost-head">
          <span className="ost-title">{album.title}</span>
          <span className="type-chip mono">{t(`games:ostKind_${album.kind}`)}</span>
          {canCurate && (
            <button type="button" className="alias-del" title={t('games:ostRemove')} onClick={() => onRemove(album.id)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
        <span className="ost-meta mono">
          {[album.composer, year, album.track_count ? t('games:ostTracks', { count: album.track_count }) : null]
            .filter(Boolean).join(' · ')}
        </span>
        {tracks.length > 0 && (
          <>
            <button type="button" className="ost-toggle mono" onClick={() => setOpen((o) => !o)}>
              <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
              {open ? t('games:ostHideTracks') : t('games:ostShowTracks')}
            </button>
            {open && (
              <ol className="ost-tracks">
                {tracks.map((tr) => (
                  <li key={`${tr.disc}-${tr.position}`}>
                    <span className="ost-tn mono">{tr.disc > 1 ? `${tr.disc}.` : ''}{tr.position}</span>
                    <span className="ost-tt">{tr.title}</span>
                    <span className="ost-td mono">{mmss(tr.duration_ms)}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        <span className="ost-links">
          {mbid && (
            <a className="section-link mono" href={`https://musicbrainz.org/release-group/${mbid}`}
              target="_blank" rel="noreferrer">MusicBrainz →</a>
          )}
          {canCurate && mbid && (
            <button type="button" className="ost-toggle mono" onClick={() => onChangeEdition(album)}>
              <Disc3 size={13} /> {t('games:ostChangeEdition')}
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

/**
 * Trilhas sonoras do jogo. Público vê; curador (manager/admin) adiciona.
 * O vínculo é CURADO de propósito: casar álbum por título erra feio
 * ("Celeste" casa com "Mélodie céleste", "Doom" com "DooM 3").
 */
export function Soundtracks({ gameId, gameTitle }: { gameId: string; gameTitle: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const canCurate = useIsCurator();
  const { data } = useSoundtracks(gameId);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState(gameTitle);
  const [kind, setKind] = useState<string>('original');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // prévia por candidato: buscada só quando o curador pede
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [previewing, setPreviewing] = useState<string | null>(null);
  // troca de edição de um álbum já cadastrado
  const [edition, setEdition] = useState<
    { id: string; title: string; releases: Release[]; current: string; loading: boolean } | null
  >(null);

  const albums = data?.albums ?? [];
  const tracks = data?.tracks ?? [];
  if (albums.length === 0 && !canCurate) return null; // sem trilha: seção some

  async function search() {
    setSearching(true);
    try {
      const d = await invokeFn<{ results: Candidate[] }>('soundtrack-import', { action: 'search', query: term.trim() });
      setResults(d.results ?? []);
      if ((d.results ?? []).length === 0) toast.error(t('games:ostNoResults'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setSearching(false); }
  }

  /**
   * Faixas do candidato, buscadas só no clique (mantém a busca leve).
   * `releaseId` troca a EDIÇÃO: um mesmo álbum tem versão JP, US, etc., e a
   * lista de faixas muda com ela (era o caso do Deltarune vir em japonês).
   */
  async function loadPreview(c: Candidate, releaseId?: string) {
    if (preview[c.mbid] && !releaseId) { // já aberto e sem troca: recolhe
      setPreview((p) => { const n = { ...p }; delete n[c.mbid]; return n; });
      return;
    }
    setPreviewing(c.mbid);
    try {
      const d = await invokeFn<Preview>('soundtrack-import', {
        action: 'preview', mbid: c.mbid, ...(releaseId ? { release_id: releaseId } : {}),
      });
      setPreview((p) => ({ ...p, [c.mbid]: { releases: d.releases ?? [], release_id: d.release_id, tracks: d.tracks ?? [] } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setPreviewing(null); }
  }

  async function add(c: Candidate) {
    setBusy(c.mbid);
    try {
      // derivação entra pendurada no álbum principal, quando já existe um
      const parent = kind === 'original' ? null : (albums.find((a) => a.kind === 'original')?.id ?? null);
      const d = await invokeFn<{ title?: string; tracks?: number }>('soundtrack-import', {
        action: 'add', game_id: gameId, mbid: c.mbid, kind, parent_id: parent,
        // respeita a edição que o curador escolheu na prévia
        ...(preview[c.mbid]?.release_id ? { release_id: preview[c.mbid].release_id } : {}),
      });
      toast.success(t('games:ostAdded', { title: d?.title ?? c.title, count: d?.tracks ?? 0 }));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['soundtracks', gameId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setBusy(null); }
  }

  /** Abre o seletor de edição de um álbum JÁ cadastrado. */
  async function openEdition(a: Soundtrack) {
    const mbid = a.external_ids?.musicbrainz;
    if (!mbid) return;
    setEdition({ id: a.id, title: a.title, releases: [], current: a.external_ids?.mb_release ?? '', loading: true });
    try {
      const d = await invokeFn<Preview>('soundtrack-import', { action: 'preview', mbid });
      setEdition({
        id: a.id, title: a.title, releases: d.releases ?? [],
        current: a.external_ids?.mb_release || d.release_id, loading: false,
      });
    } catch (err) {
      setEdition(null);
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  /** Regrava as faixas do álbum com a edição escolhida. */
  async function applyEdition(releaseId: string) {
    if (!edition) return;
    setEdition({ ...edition, loading: true });
    try {
      const d = await invokeFn<{ tracks?: number }>('soundtrack-import', {
        action: 'set-release', id: edition.id, release_id: releaseId,
      });
      toast.success(t('games:ostEditionSet', { count: d?.tracks ?? 0 }));
      setEdition(null);
      void qc.invalidateQueries({ queryKey: ['soundtracks', gameId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
      setEdition((e) => (e ? { ...e, loading: false } : null));
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t('games:ostRemoveConfirm'))) return;
    try {
      await invokeFn('soundtrack-import', { action: 'remove', id });
      void qc.invalidateQueries({ queryKey: ['soundtracks', gameId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  // principais primeiro, cada um seguido das suas derivações
  const mains = albums.filter((a) => !a.parent_id);
  const ordered = [...mains.flatMap((m) => [m, ...albums.filter((a) => a.parent_id === m.id)]),
    ...albums.filter((a) => a.parent_id && !mains.some((m) => m.id === a.parent_id))];

  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('games:ostTitle')}</h2>
        {canCurate && (
          <Button size="sm" variant="secondary" onClick={() => { setResults([]); setTerm(gameTitle); setOpen(true); }}>
            <Plus size={14} /> {t('games:ostAdd')}
          </Button>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="page-sub">{t('games:ostEmpty')}</p>
      ) : (
        <div className="ost-list">
          {ordered.map((a) => (
            <AlbumCard key={a.id} album={a} canCurate={canCurate} onRemove={(id) => void remove(id)}
              onChangeEdition={(al) => void openEdition(al)}
              tracks={tracks.filter((tr) => tr.soundtrack_id === a.id)} />
          ))}
        </div>
      )}

      {open && (
        <Dialog open={open} onClose={() => setOpen(false)} title={t('games:ostSearchTitle')}>
          <p className="page-sub">{t('games:ostSearchHint')}</p>
          <div className="admin-tools-row" style={{ marginTop: 'var(--s3)' }}>
            <Input value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder={t('games:ostSearchPh')} aria-label={t('games:ostSearchPh')}
              onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} />
            <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('games:ostKindLabel')} style={{ maxWidth: 150 }}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`games:ostKind_${k}`)}</option>)}
            </Select>
            <Button size="sm" variant="primary" disabled={searching || !term.trim()} onClick={() => void search()}>
              {searching ? <Spinner /> : <Search size={14} />} {t('admin:addSearch')}
            </Button>
          </div>
          {results.length > 0 && (
            <ul className="link-results">
              {results.map((c) => (
                <li key={c.mbid} className="link-result">
                  <div className="link-result-body">
                    <span className="link-result-title">
                      {c.title}{c.first_release ? ` (${c.first_release.slice(0, 4)})` : ''}
                    </span>
                    <span className="link-result-plats mono">
                      {[c.artist, ...(c.secondary_types ?? [])].filter(Boolean).join(' · ')}
                    </span>
                    <button type="button" className="ost-toggle mono"
                      disabled={previewing === c.mbid} onClick={() => void loadPreview(c)}>
                      {previewing === c.mbid ? <Spinner /> : <ChevronDown size={13}
                        style={{ transform: preview[c.mbid] ? 'rotate(180deg)' : undefined }} />}
                      {preview[c.mbid] ? t('games:ostHideTracks') : t('games:ostShowTracks')}
                    </button>
                    {preview[c.mbid] && (
                      <>
                        {preview[c.mbid].releases.length > 1 && (
                          <label className="ost-edition mono">
                            {t('games:ostEdition')}
                            <Select value={preview[c.mbid].release_id}
                              onChange={(e) => void loadPreview(c, e.target.value)}
                              disabled={previewing === c.mbid} aria-label={t('games:ostEdition')}>
                              {preview[c.mbid].releases.map((r) => (
                                <option key={r.id} value={r.id}>{releaseLabel(r)}</option>
                              ))}
                            </Select>
                          </label>
                        )}
                        {preview[c.mbid].tracks.length === 0
                          ? <span className="ost-meta mono">{t('games:ostNoTracks')}</span>
                          : (
                            <ol className="ost-tracks">
                              {preview[c.mbid].tracks.map((tr) => (
                                <li key={`${tr.disc}-${tr.position}`}>
                                  <span className="ost-tn mono">{tr.disc > 1 ? `${tr.disc}.` : ''}{tr.position}</span>
                                  <span className="ost-tt">{tr.title}</span>
                                  <span className="ost-td mono">{mmss(tr.duration_ms)}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                      </>
                    )}
                  </div>
                  <Button size="sm" variant="primary" disabled={busy === c.mbid} onClick={() => void add(c)}>
                    {busy === c.mbid ? <Spinner /> : <Plus size={14} />} {t('games:ostAddPick')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}

      {edition && (
        <Dialog open onClose={() => setEdition(null)} title={t('games:ostEditionTitle', { title: edition.title })}>
          <p className="page-sub">{t('games:ostEditionHint')}</p>
          {edition.loading && edition.releases.length === 0 ? <Spinner /> : (
            <ul className="link-results">
              {edition.releases.map((r) => (
                <li key={r.id} className="link-result">
                  <div className="link-result-body">
                    <span className="link-result-title">{releaseLabel(r)}</span>
                    {r.id === edition.current && (
                      <span className="link-result-plats mono">{t('games:ostEditionCurrent')}</span>
                    )}
                  </div>
                  <Button size="sm" variant={r.id === edition.current ? 'ghost' : 'primary'}
                    disabled={edition.loading || r.id === edition.current}
                    onClick={() => void applyEdition(r.id)}>
                    {t('games:ostEditionUse')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </section>
  );
}
