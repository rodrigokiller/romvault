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

/** provedores da busca — o edge normaliza os dois pro mesmo formato */
const PROVIDERS = ['musicbrainz', 'discogs'] as const;
type Provider = typeof PROVIDERS[number];
const PROVIDER_LABEL: Record<Provider, string> = { musicbrainz: 'MusicBrainz', discogs: 'Discogs' };

interface Candidate {
  id: string; title: string; artist: string | null; year: string | null;
  /** o Discogs manda a capa na busca; no MusicBrainz vem por URL do CAA */
  cover_url: string | null;
  /** "Vinyl/LP · Fangamer FG17" ou os tipos secundários do MB */
  meta: string | null;
}
type PreviewTrack = {
  disc: number; position: number; title: string; duration_ms: number | null;
  /** "A1" no vinil, "2-14" em box set — o Discogs numera assim */
  position_label?: string | null;
};
interface Release {
  id: string; date: string | null; country: string | null; script: string | null;
  language: string | null; disambiguation: string | null; tracks: number | null;
}
interface Preview { releases: Release[]; release_id: string; tracks: PreviewTrack[] }

/**
 * Capa direto do Cover Art Archive. Eles servem por URL fixa
 * (/release/<id>/front-250), então não custa request nenhum nosso — e quando o
 * álbum não tem capa a imagem dá 404 e a gente simplesmente esconde.
 */
function CoverThumb({ kind, mbid, alt, src }: {
  kind?: 'release' | 'release-group'; mbid?: string; alt: string;
  /** url pronta (Discogs); sem ela, monta a do Cover Art Archive pelo mbid */
  src?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const url = src ?? (mbid && kind ? `https://coverartarchive.org/${kind}/${mbid}/front-250` : null);
  if (!url || failed) return <div className="ost-thumb ost-thumb-empty"><Disc3 size={18} aria-hidden /></div>;
  return <img className="ost-thumb" src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

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
                    <span className="ost-tn mono">
                      {tr.position_label ?? `${tr.disc > 1 ? `${tr.disc}.` : ''}${tr.position}`}
                    </span>
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
  const [provider, setProvider] = useState<Provider>('musicbrainz');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // prévia por candidato: buscada só quando o curador pede
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [previewing, setPreviewing] = useState<string | null>(null);
  // troca de edição de um álbum já cadastrado
  const [edition, setEdition] = useState<
    { id: string; title: string; provider: Provider; releases: Release[]; current: string; loading: boolean } | null
  >(null);
  // faixas por EDIÇÃO no diálogo de troca (carregadas sob demanda)
  const [relTracks, setRelTracks] = useState<Record<string, PreviewTrack[]>>({});
  const [relTracksBusy, setRelTracksBusy] = useState<string | null>(null);

  /** Faixas de uma edição específica — 1 request, só quando o curador abre. */
  async function loadReleaseTracks(releaseId: string) {
    if (relTracks[releaseId]) {
      setRelTracks((p) => { const n = { ...p }; delete n[releaseId]; return n; });
      return;
    }
    setRelTracksBusy(releaseId);
    try {
      const d = await invokeFn<{ tracks: PreviewTrack[] }>('soundtrack-import', {
        action: 'tracks', release_id: releaseId, provider: edition?.provider ?? 'musicbrainz',
      });
      setRelTracks((p) => ({ ...p, [releaseId]: d.tracks ?? [] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setRelTracksBusy(null); }
  }

  const albums = data?.albums ?? [];
  const tracks = data?.tracks ?? [];
  if (albums.length === 0 && !canCurate) return null; // sem trilha: seção some

  async function search() {
    setSearching(true);
    try {
      const d = await invokeFn<{ results: Candidate[] }>('soundtrack-import', {
        action: 'search', query: term.trim(), provider,
      });
      setResults(d.results ?? []);
      setPreview({}); // prévias do provedor anterior não valem mais
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
    if (preview[c.id] && !releaseId) { // já aberto e sem troca: recolhe
      setPreview((p) => { const n = { ...p }; delete n[c.id]; return n; });
      return;
    }
    setPreviewing(c.id);
    try {
      const d = await invokeFn<Preview>('soundtrack-import', {
        action: 'preview', id: c.id, provider, ...(releaseId ? { release_id: releaseId } : {}),
      });
      setPreview((p) => ({ ...p, [c.id]: { releases: d.releases ?? [], release_id: d.release_id, tracks: d.tracks ?? [] } }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setPreviewing(null); }
  }

  async function add(c: Candidate) {
    setBusy(c.id);
    try {
      // derivação entra pendurada no álbum principal, quando já existe um
      const parent = kind === 'original' ? null : (albums.find((a) => a.kind === 'original')?.id ?? null);
      const d = await invokeFn<{ title?: string; tracks?: number }>('soundtrack-import', {
        action: 'add', game_id: gameId, id: c.id, provider, kind, parent_id: parent,
        // respeita a edição que o curador escolheu na prévia
        ...(preview[c.id]?.release_id ? { release_id: preview[c.id].release_id } : {}),
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
    // o álbum sabe de onde veio: guardamos o id do provedor em external_ids
    const prov: Provider = a.external_ids?.discogs ? 'discogs' : 'musicbrainz';
    const albumId = prov === 'discogs' ? a.external_ids?.discogs : a.external_ids?.musicbrainz;
    const currentKey = prov === 'discogs' ? 'discogs_release' : 'mb_release';
    if (!albumId) return;
    setEdition({
      id: a.id, title: a.title, provider: prov, releases: [],
      current: a.external_ids?.[currentKey] ?? '', loading: true,
    });
    try {
      const d = await invokeFn<Preview>('soundtrack-import', { action: 'preview', id: albumId, provider: prov });
      setEdition({
        id: a.id, title: a.title, provider: prov, releases: d.releases ?? [],
        current: a.external_ids?.[currentKey] || d.release_id, loading: false,
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
        action: 'set-release', id: edition.id, release_id: releaseId, provider: edition.provider,
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
            <Select value={provider} onChange={(e) => { setProvider(e.target.value as Provider); setResults([]); }}
              aria-label={t('games:ostProvider')} style={{ maxWidth: 140 }}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
            </Select>
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
                <li key={c.id} className="link-result">
                  <CoverThumb kind="release-group" mbid={c.id} src={c.cover_url} alt={c.title} />
                  <div className="link-result-body">
                    <span className="link-result-title">
                      {c.title}{c.year ? ` (${c.year})` : ''}
                    </span>
                    <span className="link-result-plats mono">
                      {[c.artist, c.meta].filter(Boolean).join(' · ')}
                    </span>
                    <button type="button" className="ost-toggle mono"
                      disabled={previewing === c.id} onClick={() => void loadPreview(c)}>
                      {previewing === c.id ? <Spinner /> : <ChevronDown size={13}
                        style={{ transform: preview[c.id] ? 'rotate(180deg)' : undefined }} />}
                      {preview[c.id] ? t('games:ostHideTracks') : t('games:ostShowTracks')}
                    </button>
                    {preview[c.id] && (
                      <>
                        {preview[c.id].releases.length > 1 && (
                          <label className="ost-edition mono">
                            {t('games:ostEdition')}
                            <Select value={preview[c.id].release_id}
                              onChange={(e) => void loadPreview(c, e.target.value)}
                              disabled={previewing === c.id} aria-label={t('games:ostEdition')}>
                              <option value="">{t('games:ostEditionDefault')}</option>
                              {preview[c.id].releases.map((r) => (
                                <option key={r.id} value={r.id}>{releaseLabel(r)}</option>
                              ))}
                            </Select>
                          </label>
                        )}
                        {preview[c.id].tracks.length === 0
                          ? <span className="ost-meta mono">{t('games:ostNoTracks')}</span>
                          : (
                            <ol className="ost-tracks">
                              {preview[c.id].tracks.map((tr) => (
                                <li key={`${tr.disc}-${tr.position}`}>
                                  <span className="ost-tn mono">{tr.position_label ?? tr.position}</span>
                                  <span className="ost-tt">{tr.title}</span>
                                  <span className="ost-td mono">{mmss(tr.duration_ms)}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                      </>
                    )}
                  </div>
                  <Button size="sm" variant="primary" disabled={busy === c.id} onClick={() => void add(c)}>
                    {busy === c.id ? <Spinner /> : <Plus size={14} />} {t('games:ostAddPick')}
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
                  <CoverThumb kind="release" mbid={edition.provider === 'musicbrainz' ? r.id : undefined}
                    alt={releaseLabel(r)} />
                  <div className="link-result-body">
                    <span className="link-result-title">{releaseLabel(r)}</span>
                    {r.id === edition.current && (
                      <span className="link-result-plats mono">{t('games:ostEditionCurrent')}</span>
                    )}
                    <button type="button" className="ost-toggle mono"
                      disabled={relTracksBusy === r.id} onClick={() => void loadReleaseTracks(r.id)}>
                      {relTracksBusy === r.id ? <Spinner /> : <ChevronDown size={13}
                        style={{ transform: relTracks[r.id] ? 'rotate(180deg)' : undefined }} />}
                      {relTracks[r.id] ? t('games:ostHideTracks') : t('games:ostShowTracks')}
                    </button>
                    {relTracks[r.id] && (
                      relTracks[r.id].length === 0
                        ? <span className="ost-meta mono">{t('games:ostNoTracks')}</span>
                        : (
                          <ol className="ost-tracks">
                            {relTracks[r.id].map((tr) => (
                              <li key={`${tr.disc}-${tr.position}`}>
                                <span className="ost-tn mono">
                                  {tr.position_label ?? `${tr.disc > 1 ? `${tr.disc}.` : ''}${tr.position}`}
                                </span>
                                <span className="ost-tt">{tr.title}</span>
                                <span className="ost-td mono">{mmss(tr.duration_ms)}</span>
                              </li>
                            ))}
                          </ol>
                        )
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
