import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbox } from '@/components/ui/Lightbox';

interface ArtMeta {
  boxart?: string;
  box3d?: string;
  moby?: { front?: string; back?: string; media?: string };
}

/**
 * Scans físicos da caixa (MobyGames/libretro/ScreenScraper): frente, verso,
 * mídia, box 3D — tira com rótulo, clique abre o Lightbox.
 */
export function BoxScans({ metadata }: { metadata: unknown }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(-1);
  const meta = (metadata ?? {}) as ArtMeta;

  const scans: { label: string; src: string }[] = [];
  const push = (label: string, src?: string | null) => {
    if (src && !scans.some((s) => s.src === src)) scans.push({ label, src });
  };
  push(t('games:scanFront'), meta.moby?.front);
  push(t('games:scanBack'), meta.moby?.back);
  push(t('games:scanMedia'), meta.moby?.media);
  push(t('games:scanBoxart'), meta.boxart);
  push(t('games:scanBox3d'), meta.box3d);

  if (scans.length === 0) return null;

  return (
    <div className="scan-strip-wrap">
      <h3 className="scan-strip-title mono">// {t('games:scansTitle').toLowerCase()}</h3>
      <div className="scan-strip">
        {scans.map((s, i) => (
          <figure key={s.src} className="scan-fig">
            <button type="button" className="scan-btn" onClick={() => setOpen(i)} title={s.label}>
              <img src={s.src} alt={`${s.label}`} loading="lazy" />
            </button>
            <figcaption className="mono">{s.label}</figcaption>
          </figure>
        ))}
      </div>
      {open >= 0 && (
        <Lightbox
          images={scans.map((s) => s.src)}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(-1)}
        />
      )}
    </div>
  );
}
