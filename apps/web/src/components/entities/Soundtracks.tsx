import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Disc3, Plus, Search, Trash2, ChevronDown } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { invokeFn } from '@/lib/invokeFn';
import { useIsCurator } from '@/hooks/useProfile';
import { useToast } from '@/components/ui/Toast';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/feedback';

const db = () => getSupabase() as unknown as SupabaseClient;

/** tipos de álbum — 'inspired' é o caso "Music Inspired by The Witcher" */
const KINDS = ['original', 'arrange', 'vocal', 'remix', 'cover', 'piano', 'live', 'selection', 'inspired', 'other'] as const;

interface Soundtrack {
  id: string; title: string; kind: string; parent_id: string | null;
  composer: string | null; release_date: string | null;
  disc_count: number | null; track_count: number | null; cover_url: string | null;
  external_ids: Record<string, string> | null;
}
interface Track { soundtrack_id: string; disc: number; position: number; title: string; duration_ms: number | null }
interface Candidate {
  mbid: string; title: string; artist: string | null;
  first_release: string | null; secondary_types: string[];
}

const mmss = (ms: number | null) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function useSoundtracks(gameId: string) {
  return useQuery({
    queryKey: ['soundtracks', gameId],
    enabled: env.configured && !!gameId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ albums: Soundtrack[]; tracks: Track[] }> => {
      const { data, error } = await db().from('game_soundtracks')
        .select('id, title, kind, parent_id, composer, release_date, disc_count, track_count, cover_url, external_ids')
        .eq('game_id', gameId).order('release_date', { ascending: true, nullsFirst: false });
      if (error) return { albums: [], tracks: [] }; // tabela ainda não migrada
      const albums = (data ?? []) as Soundtrack[];
      if (albums.length === 0) return { albums, tracks: [] };
      const { data: tk } = await db().from('soundtrack_tracks')
        .select('soundtrack_id, disc, position, title, duration_ms')
        .in('soundtrack_id', albums.map((a) => a.id))
        .order('disc').order('position');
      return { albums, tracks: (tk ?? []) as Track[] };
    },
  });
}

/** Um álbum: capa, dados e faixas (recolhidas por padrão). */
function AlbumCard({ album, tracks, canCurate, onRemove }: {
  album: Soundtrack; tracks: Track[]; canCurate: boolean; onRemove: (id: string) => void;
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
        {mbid && (
          <a className="section-link mono" href={`https://musicbrainz.org/release-group/${mbid}`}
            target="_blank" rel="noreferrer">MusicBrainz →</a>
        )}
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

  async function add(c: Candidate) {
    setBusy(c.mbid);
    try {
      // derivação entra pendurada no álbum principal, quando já existe um
      const parent = kind === 'original' ? null : (albums.find((a) => a.kind === 'original')?.id ?? null);
      const d = await invokeFn<{ title?: string; tracks?: number }>('soundtrack-import', {
        action: 'add', game_id: gameId, mbid: c.mbid, kind, parent_id: parent,
      });
      toast.success(t('games:ostAdded', { title: d?.title ?? c.title, count: d?.tracks ?? 0 }));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['soundtracks', gameId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    } finally { setBusy(null); }
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
    </section>
  );
}
