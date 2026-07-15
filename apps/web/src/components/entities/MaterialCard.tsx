import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Star } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { KIND_META, type Kind } from './kinds';

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Chips secundários específicos de cada tipo (versão, idioma, licença…). */
function chipsFor(kind: Kind, item: Row): string[] {
  switch (kind) {
    case 'romhack':
      return [str(item.version) && `v${item.version}`, str(item.difficulty)].filter(Boolean) as string[];
    case 'translation': {
      const pct = typeof item.completion_percentage === 'number' ? `${item.completion_percentage}%` : null;
      return [str(item.language), pct].filter(Boolean) as string[];
    }
    case 'doc':
      return [str(item.category), str(item.file_format)].filter(Boolean) as string[];
    case 'tool':
      return [str(item.category), str(item.license)].filter(Boolean) as string[];
    default:
      return [];
  }
}

export function MaterialCard({ kind, item }: { kind: Kind; item: Row }) {
  const { t } = useTranslation();
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const id = String(item.id);
  const title = str(item.title) ?? '—';
  const description = str(item.description);
  const thumb = str(item.thumbnail);
  const downloads = num(item.downloads);
  const rating = num(item.rating);
  const chips = chipsFor(kind, item);

  return (
    <Link to={`/${meta.route}/${id}`} style={{ display: 'block' }}>
      <Card interactive padSm>
        <div className="tile">
          <div className="tile-thumb">
            {thumb ? <img src={thumb} alt={title} loading="lazy" /> : <Icon aria-hidden />}
          </div>
          <div className="tile-body">
            <div className="tile-badges">
              <Badge tone={meta.tone}>{t(meta.kindKey)}</Badge>
              {chips.map((chip) => (
                <span key={chip} className="chip">
                  {chip}
                </span>
              ))}
            </div>
            <span className="tile-title">{title}</span>
            {description && <p className="tile-desc">{description}</p>}
            <div className="tile-meta">
              <span className="tile-stat">
                <Download aria-hidden /> {downloads.toLocaleString()}
              </span>
              {rating > 0 && (
                <span className="tile-stat dot">
                  <Star aria-hidden /> {rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
