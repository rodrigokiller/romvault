import { useTranslation } from 'react-i18next';
import { Timer, Trophy, Youtube, ExternalLink } from 'lucide-react';
import { useSpeedruns } from '@/hooks/useSpeedruns';
import { EmptyState } from '@/components/ui/feedback';

/** segundos -> "6:17.95" / "4:14:58" */
function fmtTime(sec: number | null): string {
  if (sec == null) return '?';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const frac = sec % 1 ? (sec % 1).toFixed(2).slice(1) : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}${frac}` : `${m}:${pad(s)}${frac}`;
}

/** Aba Speedruns: recordes (WR) por categoria, do speedrun.com. */
export function SpeedrunsTab({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const { data: runs = [], isLoading, isError } = useSpeedruns(gameId);

  if (isLoading) return <p className="muted-text">{t('common:loading')}</p>;
  if (isError || runs.length === 0) {
    return <EmptyState icon={Timer} title={t('speedruns:emptyTitle')} text={t('speedruns:emptyText')} />;
  }

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <span className="kicker">// speedrun.com</span>
          <h2><Timer aria-hidden style={{ width: 16, height: 16, verticalAlign: '-2px' }} /> {t('speedruns:title')}</h2>
        </div>
      </div>
      <ul className="speedrun-list">
        {runs.map((r) => (
          <li key={r.category} className="speedrun-row">
            <Trophy aria-hidden className="speedrun-medal" />
            <div className="speedrun-body">
              <span className="speedrun-cat">{r.category}</span>
              <span className="speedrun-meta mono">
                {r.runner ?? '?'}
                {r.run_url && (
                  <>
                    {' · '}
                    <a href={r.run_url} target="_blank" rel="noopener noreferrer">
                      speedrun.com <ExternalLink aria-hidden style={{ width: 11, height: 11, verticalAlign: '-1px' }} />
                    </a>
                  </>
                )}
              </span>
            </div>
            {r.video_url && (
              <a href={r.video_url} target="_blank" rel="noopener noreferrer" className="speedrun-video" title={t('speedruns:watch')}>
                <Youtube aria-hidden />
              </a>
            )}
            <span className="speedrun-time mono">{fmtTime(r.time_seconds)}</span>
          </li>
        ))}
      </ul>
      <p className="muted-text" style={{ marginTop: 'var(--s3)', fontSize: '0.78rem' }}>{t('speedruns:note')}</p>
    </section>
  );
}
