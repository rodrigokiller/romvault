import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Pencil, Check, X, Library as LibraryIcon } from 'lucide-react';
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
import { useLibrary, useUserPlaythroughs } from '@/hooks/useTracks';
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
  const { data: libTracks = [] } = useLibrary(profile?.id);
  const { data: playthroughs = [] } = useUserPlaythroughs(profile?.id);

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
          </p>
          <Link to={`/u/${profile.username}/library`} className="section-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 'var(--s3)' }}>
            <LibraryIcon aria-hidden style={{ width: 15, height: 15 }} /> {t('library:viewLibrary')}
          </Link>
          <BacklogProgress tracks={libTracks} />
        </div>
        {isMe && <ProfileEditor profile={profile} />}
      </div>

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

/** Linha do tempo de zeradas: "2024 ▓▓▓▓ 12" por ano (estilo Year in Review). */
function RunsTimeline({ playthroughs }: { playthroughs: { finished_on: string }[] }) {
  const { t } = useTranslation();
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
            <span className="runs-year-label mono">{year}</span>
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

/** Barra de progresso do backlog: terminados / total da biblioteca. */
function BacklogProgress({ tracks }: { tracks: { status: string }[] }) {
  const { t } = useTranslation();
  const total = tracks.length;
  if (total === 0) return null;
  const finished = tracks.filter((x) => x.status === 'finished').length;
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
