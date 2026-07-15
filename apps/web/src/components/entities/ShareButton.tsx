import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Link2, Twitter, Share } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/** Compartilhar: copiar link, X/Twitter e share nativo (quando disponível). */
export function ShareButton({ title }: { title: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const hasNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('community:linkCopied'));
    } catch {
      toast.error(t('forms:submitError'));
    }
    setOpen(false);
  }

  async function native() {
    try {
      await navigator.share({ title, url });
    } catch {
      /* usuário cancelou */
    }
    setOpen(false);
  }

  return (
    <div
      className="share"
      ref={ref}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Share2 aria-hidden /> {t('community:share')}
      </Button>
      {open && (
        <div className="share-menu" role="menu">
          <button type="button" className="share-item" role="menuitem" onMouseDown={(e) => { e.preventDefault(); void copy(); }}>
            <Link2 aria-hidden /> {t('community:copyLink')}
          </button>
          <a
            className="share-item"
            role="menuitem"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <Twitter aria-hidden /> X / Twitter
          </a>
          {hasNative && (
            <button type="button" className="share-item" role="menuitem" onMouseDown={(e) => { e.preventDefault(); void native(); }}>
              <Share aria-hidden /> {t('community:shareNative')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
