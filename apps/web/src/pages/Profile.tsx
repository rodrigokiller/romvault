import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { User, Pencil, Check, X, Library as LibraryIcon, Store, UserPlus, UserMinus, Trophy, BarChart3, BadgeCheck, Flame } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState, LoadingPage } from '@/components/ui/feedback';
import { MaterialCard } from '@/components/entities/MaterialCard';
import { GameCard } from '@/components/entities/GameCard';
import { useToast } from '@/components/ui/Toast';
import {
  useProfileByUsername, useMyProfile, useContributions, useUpdateProfile,
} from '@/hooks/useProfile';
import { useMyFavorites } from '@/hooks/useFavorites';
import { useTrackPulse, useUserPlaythroughs, useLibraryCopies, usePlayHistory, type GameCopy } from '@/hooks/useTracks';
import { useIsFollowing, useToggleFollow, useFollowCounts, useFriendsFeed } from '@/hooks/useFollows';
import { useAuth } from '@/auth/AuthProvider';
import type { Kind } from '@/components/entities/kinds';
import type { Game } from '@romvault/core';

type Row = Record<string, unknown>;

export function Profile() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const { data: profile, isLoading } = useProfileByUsername(username);
  const { data: me } = useMyProfile();
  const { data: contrib } = useContributions(profile?.id);
  const { data: favorites = [] } = useMyFavorites(profile?.id);
  // pulso magro (status+updated_at): o perfil não precisa dos jogos embutidos
  const { data: libTracks = [] } = useTrackPulse(profile?.id);
  const { data: playthroughs = [] } = useUserPlaythroughs(profile?.id);
  const { data: copies = [] } = useLibraryCopies(profile?.id);
  const { data: followCounts } = useFollowCounts(profile?.id);

  if (isLoading) return <LoadingPage />;
  if (!profile) {
    return (
      <div className="container">
        <header className="page-head">
          <span className="kicker">// {t('nav:profile')}</span>
          <h1>@{username}</h1>
        </header>
        <EmptyState icon={User} title={t('profile:notFound')} />
      </div>
    );
  }

  const isMe = me?.id === profile.id;
  const groups: { kind: Kind; items: Row[] }[] = [
    { kind: 'romhack', items: (contrib?.romhacks ?? []) as Row[] },
    { kind: 'translation', items: (contrib?.translations ?? []) as Row[] },
    { kind: 'doc', items: (contrib?.documents ?? []) as Row[] },
    { kind: 'tool', items: (contrib?.tools ?? []) as Row[] },
  ];
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="container">
      <div className="profile-head">
        <div className="profile-avatar">
          {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.username ?? ''} /> : <User aria-hidden />}
        </div>
        <div className="profile-info">
          <h1>@{profile.username}</h1>
          {profile.is_admin && <span className="chip">admin</span>}
          {profile.bio && <p className="page-sub">{profile.bio}</p>}
          <p className="muted-text mono profile-joined">
            {t('profile:joined')} {new Date(profile.created_at).toLocaleDateString()}
            {followCounts && (
              <> · {t('profile:followers', { count: followCounts.followers })} · {t('profile:following', { count: followCounts.following })}</>
            )}
          </p>
          <span style={{ display: 'inline-flex', gap: 'var(--s4)', marginTop: 'var(--s3)' }}>
            <Link to={`/u/${profile.username}/library`} className="section-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <LibraryIcon aria-hidden style={{ width: 15, height: 15 }} /> {t('library:viewLibrary')}
            </Link>
            <Link to={`/u/${profile.username}/vitrine`} className="section-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Store aria-hidden style={{ width: 15, height: 15 }} /> {t('vitrine:viewVitrine')}
            </Link>
            <Link
              to={`/u/${profile.username}/stats`}
              className="section-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <BarChart3 aria-hidden style={{ width: 15, height: 15 }} /> {t('ustats:link')}
            </Link>
            {playthroughs.length > 0 && (
              <Link
                to={`/u/${profile.username}/year/${new Date().getFullYear()}`}
                className="section-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trophy aria-hidden style={{ width: 15, height: 15 }} /> {t('profile:yearReview', { year: new Date().getFullYear() })}
              </Link>
            )}
          </span>
          <SyncedBadges username={profile.username ?? ''} />
          <InvitedBy invitedBy={(profile as unknown as { invited_by?: string | null }).invited_by} />
          <BacklogProgress tracks={libTracks} />
        </div>
        {isMe ? <ProfileEditor profile={profile} /> : <FollowButton userId={profile.id} />}
      </div>

      <ActivityStrip tracks={libTracks} playthroughs={playthroughs} copies={copies} />

      <PlayHistorySection userId={profile.id} />

      <VitrineTeaser userId={profile.id} username={profile.username ?? username ?? ''} copies={copies} />

      {isMe && <FriendsFeed />}

      <section className="section">
        <div className="section-head">
          <h2>{t('profile:contributions', { count: total })}</h2>
        </div>
        {total === 0 ? (
          <EmptyState icon={User} title={t('profile:empty')} />
        ) : (
          groups.map((g) =>
            g.items.length > 0 ? (
              <div key={g.kind} style={{ marginBottom: 'var(--s5)' }}>
                <div className="card-grid">
                  {g.items.map((item) => (
                    <MaterialCard key={String(item.id)} kind={g.kind} item={item} />
                  ))}
                </div>
              </div>
            ) : null,
          )
        )}
      </section>

      {playthroughs.length > 0 && <RunsTimeline playthroughs={playthroughs} />}

      <SceneStats userId={profile.id} />

      {isMe && favorites.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>{t('community:favoritesTitle')}</h2>
          </div>
          <div className="card-grid">
            {favorites.map((f) =>
              f.kind === 'game' ? (
                <GameCard key={`g-${String(f.item.id)}`} game={f.item as unknown as Game} />
              ) : (
                <MaterialCard key={`${f.kind}-${String(f.item.id)}`} kind={f.kind} item={f.item} />
              ),
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Atividade da semana (estilo gametrack): jogos com atividade, zeradas e
 * cópias novas nos últimos 7 dias — calculado do que a página já carrega.
 */
function ActivityStrip({ tracks, playthroughs, copies }: {
  tracks: { updated_at: string }[];
  playthroughs: { finished_on: string }[];
  copies: { id: string }[] & { acquired_at?: string | null }[];
}) {
  const { t } = useTranslation();
  const weekAgo = Date.now() - 7 * 86_400_000;
  const active = tracks.filter((x) => new Date(x.updated_at).getTime() >= weekAgo).length;
  const runs = playthroughs.filter((p) => new Date(p.finished_on).getTime() >= weekAgo).length;
  const newCopies = (copies as { acquired_at?: string | null }[])
    .filter((c) => c.acquired_at && new Date(c.acquired_at).getTime() >= weekAgo).length;
  if (active === 0 && runs === 0 && newCopies === 0) return null;
  return (
    <div className="activity-strip mono">
      <span className="activity-label">// {t('profile:weekActivity')}</span>
      <span className="activity-item">{t('profile:weekActive', { count: active })}</span>
      {runs > 0 && <span className="activity-item">{t('profile:weekRuns', { count: runs })}</span>}
      {newCopies > 0 && <span className="activity-item">{t('profile:weekCopies', { count: newCopies })}</span>}
    </div>
  );
}

/**
 * Cartão-vitrine do perfil: as últimas aquisições em mini-prateleira +
 * contadores — a porta de entrada visual pra /vitrine.
 */
function VitrineTeaser({ userId, username, copies }: { userId: string; username: string; copies: GameCopy[] }) {
  const { t } = useTranslation();
  // contadores derivados das cópias que a página JÁ carregou (era um fetch
  // duplicado da tabela inteira — achado do polish); só as capas têm query
  const games = new Set(copies.map((c) => c.game_id)).size;
  const platforms = new Set(copies.map((c) => c.platform)).size;
  const { data: covers = [] } = useVitrineTeaserCovers(games > 0 ? userId : undefined);
  if (games === 0) return null;
  return (
    <Link to={`/u/${username}/vitrine`} className="vt-teaser">
      <span className="vt-teaser-covers" aria-hidden>
        {covers.map((src, i) => (
          <img key={src} src={src} alt="" style={{ zIndex: covers.length - i }} loading="lazy" />
        ))}
      </span>
      <span className="vt-teaser-info">
        <span className="kicker">// {t('vitrine:teaserKicker')}</span>
        <span className="vt-teaser-count">
          {t('vitrine:subtitle', { count: games })}
          {' · '}
          {t('vitrine:teaserPlatforms', { count: platforms })}
        </span>
        <span className="vt-teaser-cta mono">{t('vitrine:viewVitrine')} {'->'}</span>
      </span>
    </Link>
  );
}

/** Só as 5 capas mais recentes pro cartão-vitrine (contadores vêm da página). */
function useVitrineTeaserCovers(userId: string | undefined) {
  return useQuery({
    queryKey: ['vitrineTeaserCovers', userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data: recent } = await sb.from('game_copies')
        .select('game_id, game:games(cover_url, thumbnail)')
        .eq('user_id', userId as string)
        .order('created_at', { ascending: false })
        .limit(14);
      const covers: string[] = [];
      const seen = new Set<string>();
      for (const r of (recent ?? []) as unknown as { game_id: string; game: { cover_url: string | null; thumbnail: string | null } | null }[]) {
        if (seen.has(r.game_id)) continue;
        seen.add(r.game_id);
        const src = r.game?.cover_url ?? r.game?.thumbnail;
        if (src) covers.push(src);
        if (covers.length >= 5) break;
      }
      return covers;
    },
  });
}

/**
 * "Zeradas com a cena": quantas vezes o usuário terminou jogos COM tradução/
 * hack de fã, e quais materiais mais usou — crédito do tracker pra cena.
 */
function SceneStats({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['sceneStats', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data: runs } = await sb
        .from('game_playthroughs').select('patch_kind, patch_id')
        .eq('user_id', userId).not('patch_id', 'is', null)
        .range(0, 4999);
      const rows = (runs ?? []) as { patch_kind: 'translation' | 'romhack'; patch_id: string }[];
      if (rows.length === 0) return { total: 0, top: [] as { label: string; kind: string; n: number }[] };
      const counts = new Map<string, number>();
      for (const r of rows) {
        const k = `${r.patch_kind}:${r.patch_id}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const trIds = rows.filter((r) => r.patch_kind === 'translation').map((r) => r.patch_id);
      const rhIds = rows.filter((r) => r.patch_kind === 'romhack').map((r) => r.patch_id);
      const [trs, rhs] = await Promise.all([
        trIds.length ? sb.from('translations').select('id, title, language').in('id', trIds) : Promise.resolve({ data: [] }),
        rhIds.length ? sb.from('romhacks').select('id, title').in('id', rhIds) : Promise.resolve({ data: [] }),
      ]);
      const label = new Map<string, string>();
      for (const x of (trs.data ?? []) as { id: string; title: string | null; language: string | null }[]) {
        label.set(`translation:${x.id}`, x.title ?? x.language ?? '?');
      }
      for (const x of (rhs.data ?? []) as { id: string; title: string | null }[]) {
        label.set(`romhack:${x.id}`, x.title ?? '?');
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, n]) => ({ label: label.get(k) ?? '?', kind: k.split(':')[0], n }));
      return { total: rows.length, top };
    },
  });
  if (!data || data.total === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('profile:sceneTitle')}</h2>
      </div>
      <p className="page-sub">{t('profile:sceneCount', { count: data.total })}</p>
      <ul className="scene-list">
        {data.top.map((x) => (
          <li key={`${x.kind}-${x.label}`} className="scene-item mono">
            <span className="scene-kind">{x.kind === 'translation' ? t('entities:kindTranslation') : t('entities:kindRomhack')}</span>
            <span className="scene-label">{x.label}</span>
            <span className="scene-n">×{x.n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Nome de exibição dos provedores nos badges de sync do perfil. */
const PROVIDER_LABEL: Record<string, string> = {
  steam: 'Steam',
  retroachievements: 'RA',
  psn: 'PSN',
  xbox: 'Xbox',
  gog: 'GOG',
  nintendo: 'Nintendo',
  epic: 'Epic',
};

/**
 * "Biblioteca verificada por sync": chips dos provedores conectados — prova
 * social de que a estante é alimentada por contas reais (estilo PlayTracker).
 * Só os NOMES dos provedores saem do banco (RPC público, gated em
 * library_public); nenhum dado de conta.
 */
function SyncedBadges({ username }: { username: string }) {
  const { t } = useTranslation();
  const { data: providers = [] } = useQuery({
    queryKey: ['syncedProviders', username],
    enabled: Boolean(username),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data, error } = await sb.rpc('public_synced_providers', { p_username: username });
      // RPC ainda não migrado ou perfil privado: sem badge, sem erro na tela
      if (error) return [];
      return (data ?? []) as string[];
    },
  });
  if (providers.length === 0) return null;
  return (
    <div className="sync-badges" title={t('profile:syncedHint')}>
      {providers.map((p) => (
        <span key={p} className="sync-badge mono">
          <BadgeCheck aria-hidden /> {PROVIDER_LABEL[p] ?? p}
        </span>
      ))}
    </div>
  );
}

/**
 * Histórico de jogatina (play_sessions unificado: sync + zeradas + log manual),
 * agrupado por dia — a memória de jogo que o heatmap só resume.
 */
function PlayHistorySection({ userId }: { userId: string }) {
  const { t, i18n } = useTranslation();
  const { data: history = [] } = usePlayHistory(userId, 120);
  if (history.length === 0) return null;
  // agrupa por dia (mantém a ordem desc que veio do banco)
  const byDay = new Map<string, typeof history>();
  for (const h of history) {
    if (!h.game) continue;
    byDay.set(h.played_on, [...(byDay.get(h.played_on) ?? []), h]);
  }
  // STREAK: dias consecutivos jogados terminando hoje/ontem (gancho de hábito)
  const days = new Set([...byDay.keys()]);
  let streak = 0;
  const cur = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (!days.has(iso(cur))) cur.setDate(cur.getDate() - 1); // conta se jogou ontem
  while (days.has(iso(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  const fmt = (isoDay: string) => new Date(isoDay + 'T00:00:00').toLocaleDateString(i18n.language || 'pt-BR', { day: '2-digit', month: 'short' });
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('profile:historyTitle')}</h2>
        {streak >= 2 && (
          <span className="streak-badge mono"><Flame aria-hidden /> {t('profile:streak', { count: streak })}</span>
        )}
      </div>
      <div className="play-history">
        {[...byDay.entries()].slice(0, 14).map(([day, items]) => (
          <div key={day} className="play-history-day">
            <span className="play-history-date mono">{fmt(day)}</span>
            <div className="my-strip-covers" style={{ flexWrap: 'wrap' }}>
              {[...new Map(items.map((h) => [h.game!.slug, h])).values()].map((h) => (
                <Link key={h.game!.slug} to={`/games/${h.game!.slug}`} title={`${h.game!.title} (${h.provider})`}>
                  {h.game!.cover_url || h.game!.thumbnail
                    ? <img src={h.game!.cover_url ?? h.game!.thumbnail ?? ''} alt={h.game!.title} loading="lazy" />
                    : <span className="my-strip-fallback">{h.game!.title}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "convidado por @x": a semente do social (sistema de convites do beta). */
function InvitedBy({ invitedBy }: { invitedBy?: string | null }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['inviter', invitedBy],
    enabled: Boolean(invitedBy),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const sb = getSupabase() as unknown as SupabaseClient;
      const { data: p } = await sb.from('profiles').select('username').eq('id', invitedBy as string).maybeSingle();
      return (p?.username as string | null) ?? null;
    },
  });
  if (!data) return null;
  return (
    <p className="muted-text mono" style={{ marginTop: 'var(--s2)', fontSize: '0.74rem' }}>
      {t('profile:invitedBy')} <Link to={`/u/${data}`} className="section-link">@{data}</Link>
    </p>
  );
}

/** Botão seguir/deixar de seguir (só em perfis alheios). */
function FollowButton({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { data: isFollowing = false } = useIsFollowing(userId);
  const toggle = useToggleFollow(userId);
  if (!user) return null;
  return (
    <Button
      variant={isFollowing ? 'secondary' : 'primary'}
      size="sm"
      onClick={() => void toggle.mutateAsync(isFollowing).catch(() => toast.error(t('forms:submitError')))}
      disabled={toggle.isPending}
    >
      {isFollowing ? <><UserMinus /> {t('profile:unfollow')}</> : <><UserPlus /> {t('profile:follow')}</>}
    </Button>
  );
}

/** Feed: zeradas recentes de quem eu sigo. */
function FriendsFeed() {
  const { t } = useTranslation();
  const { data: feed = [] } = useFriendsFeed();
  if (feed.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('profile:feedTitle')}</h2>
      </div>
      <ul className="feed-list">
        {feed.map((item, i) => (
          <li key={`${item.game_slug}-${i}`} className="feed-item">
            <Trophy aria-hidden className="feed-icon" />
            <span className="feed-text">
              <Link to={`/u/${item.username}`} className="feed-user">@{item.username}</Link>
              {' '}{t('profile:feedFinished')}{' '}
              <Link to={`/games/${item.game_slug}`} className="feed-game">{item.game_title}</Link>
            </span>
            <span className="feed-date mono">{new Date(item.finished_on).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Linha do tempo de zeradas: "2024 ▓▓▓▓ 12" por ano (estilo Year in Review). */
function RunsTimeline({ playthroughs }: { playthroughs: { finished_on: string }[] }) {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();
  const byYear = new Map<string, number>();
  for (const p of playthroughs) {
    const y = p.finished_on.slice(0, 4);
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  const years = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const max = Math.max(...byYear.values());
  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('library:timelineTitle')}</h2>
      </div>
      <div className="runs-timeline">
        {years.map(([year, count]) => (
          <div key={year} className="runs-year">
            <Link to={`/u/${username}/year/${year}`} className="runs-year-label mono" title={t('wrapped:kicker')}>
              {year}
            </Link>
            <div className="runs-year-bar">
              <div className="runs-year-fill" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="runs-year-count mono">{t('library:timelineCount', { count })}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Barra de progresso do backlog: terminados / jogos EM JOGO. "Na coleção"
 * (owned) fica de fora do denominador — ter 800 jogos importados da Steam
 * não significa 800 jogos na fila.
 */
function BacklogProgress({ tracks }: { tracks: { status: string }[] }) {
  const { t } = useTranslation();
  const counted = tracks.filter((x) => x.status !== 'owned');
  const total = counted.length;
  if (total === 0) return null;
  const finished = counted.filter((x) => x.status === 'finished').length;
  const pct = Math.round((finished / total) * 100);
  return (
    <div className="backlog-progress">
      <div className="backlog-progress-label mono">
        {t('library:progressLabel', { finished, total, pct })}
      </div>
      <div className="backlog-progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="backlog-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProfileEditor({ profile }: { profile: { username: string | null; bio: string | null; yearly_goal?: number | null } }) {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateProfile();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [goal, setGoal] = useState(profile.yearly_goal ? String(profile.yearly_goal) : '');

  async function save() {
    try {
      await update.mutateAsync({
        username: username.trim() || null,
        bio: bio.trim() || null,
        yearly_goal: goal ? Math.max(1, Math.min(999, Number(goal))) : null,
      });
      toast.success(t('profile:saved'));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  if (!editing) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
        <Pencil /> {t('profile:edit')}
      </Button>
    );
  }

  return (
    <Card className="profile-editor">
      <Field label={t('profile:username')}>
        {(id) => <Input id={id} value={username} onChange={(e) => setUsername(e.target.value)} />}
      </Field>
      <Field label={t('profile:bio')}>
        {(id) => <Textarea id={id} value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />}
      </Field>
      <Field label={t('library:goalField')} hint={t('library:goalHint')}>
        {(id) => (
          <Input id={id} type="number" min={1} max={999} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="20" />
        )}
      </Field>
      <div className="submit-actions">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X /> {t('forms:actionReset')}</Button>
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={update.isPending}>
          <Check /> {t('profile:save')}
        </Button>
      </div>
    </Card>
  );
}
