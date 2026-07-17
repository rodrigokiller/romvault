import { useTranslation } from 'react-i18next';
import { RefreshCw, Gamepad2, Trophy, Gamepad } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useMySyncData, type SyncData } from '@/hooks/useTracks';

const PROVIDER_META: Record<string, { label: string; icon: LucideIcon }> = {
  steam: { label: 'Steam', icon: Gamepad2 },
  retroachievements: { label: 'RetroAchievements', icon: Trophy },
  psn: { label: 'PlayStation', icon: Gamepad },
  xbox: { label: 'Xbox', icon: Gamepad2 },
  gog: { label: 'GOG', icon: Gamepad },
  nintendo: { label: 'Nintendo', icon: Gamepad2 },
  epic: { label: 'Epic', icon: Gamepad2 },
};

function pct(row: SyncData): number | null {
  if (row.progress != null) return Math.min(100, row.progress);
  if (row.achievements_total) {
    return Math.min(100, Math.round(((row.achievements_earned ?? 0) / row.achievements_total) * 100));
  }
  return null;
}

/**
 * "Dados sincronizados" DO USUÁRIO pra um jogo: uma linha por provedor
 * (o mesmo jogo pode existir em várias plataformas — cada conta tem seus
 * próprios dados: horas, conquistas, progresso, último jogo).
 * compact = versão pro quick-view (modal).
 */
export function SyncDataPanel({ gameId, compact = false }: { gameId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const { user, disabled } = useAuth();
  const { data: rows = [] } = useMySyncData(user ? gameId : undefined);

  if (disabled || !user || rows.length === 0) return null;

  return (
    <div className={`syncdata ${compact ? 'syncdata-compact' : 'copies'}`}>
      <div className="copies-head">
        <span className="copies-title mono">
          <RefreshCw aria-hidden className="syncdata-title-icon" /> {t('library:syncTitle', { count: rows.length })}
        </span>
      </div>
      <ul className="syncdata-list">
        {rows.map((row) => {
          const meta = PROVIDER_META[row.provider] ?? { label: row.provider, icon: RefreshCw };
          const Icon = meta.icon;
          const p = pct(row);
          return (
            <li key={row.provider} className="syncdata-item">
              <span className="syncdata-provider mono">
                <Icon aria-hidden /> {meta.label}
              </span>
              {row.platform && <span className="chip">{row.platform}</span>}
              <span className="syncdata-facts mono">
                {row.hours_played != null && <span>{row.hours_played}h</span>}
                {row.achievements_total != null && (
                  <span>{row.achievements_earned ?? 0}/{row.achievements_total}</span>
                )}
                {row.last_played && (
                  <span title={t('library:lastSession')}>
                    {new Date(row.last_played).toLocaleDateString()}
                  </span>
                )}
              </span>
              {p != null && (
                <span className="syncdata-bar" title={`${p}%`}>
                  <span className="syncdata-bar-fill" style={{ width: `${p}%` }} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!compact && <p className="field-hint">{t('library:syncHint')}</p>}
    </div>
  );
}
