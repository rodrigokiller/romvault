import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star, Trash2, User } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import {
  useReviews, useMyReview, useUpsertReview, useDeleteReview, type ReviewSubject,
} from '@/hooks/useReviews';

/** Estrelas: leitura (fracionada) ou entrada (clicável). */
function Stars({
  value,
  onChange,
  size = 16,
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="stars" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(shown);
        const star = (
          <Star
            aria-hidden
            width={size}
            height={size}
            style={{ fill: filled ? 'var(--amber)' : 'none', color: filled ? 'var(--amber)' : 'var(--line-bright)' }}
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            className="star-btn"
            aria-label={`${n}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

export function Reviews({ subjectType, subjectId }: { subjectType: ReviewSubject; subjectId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user, disabled } = useAuth();
  const { data } = useReviews(subjectType, subjectId);
  const { data: mine } = useMyReview(subjectType, subjectId);
  const upsert = useUpsertReview(subjectType, subjectId);
  const del = useDeleteReview(subjectType, subjectId);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  // prefill com a avaliação existente do usuário
  useEffect(() => {
    if (mine) { setRating(mine.rating); setComment(mine.comment ?? ''); }
  }, [mine]);

  async function submit() {
    if (rating < 1) { toast.error(t('community:pickRating')); return; }
    try {
      await upsert.mutateAsync({ rating, comment });
      toast.success(t('community:reviewSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  async function remove() {
    try {
      await del.mutateAsync();
      setRating(0); setComment('');
      toast.success(t('community:reviewRemoved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  const reviews = data?.reviews ?? [];
  const canReview = user && !disabled;

  return (
    <section className="section reviews">
      <div className="section-head">
        <h2>{t('community:reviewsTitle')}</h2>
        {data && data.count > 0 && (
          <span className="reviews-agg">
            <Stars value={data.avg} /> <b>{data.avg.toFixed(1)}</b>
            <span className="muted-text"> · {t('community:ratingCount', { count: data.count })}</span>
          </span>
        )}
      </div>

      {canReview ? (
        <Card className="review-form">
          <div className="review-form-row">
            <span className="review-form-label">{t('community:yourRating')}</span>
            <Stars value={rating} onChange={setRating} size={22} />
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('community:commentPh')}
            rows={3}
          />
          <div className="submit-actions">
            {mine && (
              <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={del.isPending}>
                <Trash2 /> {t('community:removeReview')}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => void submit()} disabled={upsert.isPending}>
              {mine ? t('community:updateReview') : t('community:postReview')}
            </Button>
          </div>
        </Card>
      ) : !disabled ? (
        <p className="muted-text">
          <Link to="/login" className="section-link">{t('community:loginToReview')}</Link>
        </p>
      ) : null}

      {reviews.length === 0 ? (
        <p className="muted-text" style={{ marginTop: 'var(--s4)' }}>{t('community:noReviews')}</p>
      ) : (
        <div className="review-list">
          {reviews.map((r) => (
            <div key={r.id} className="review-item">
              <div className="review-avatar">
                {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" /> : <User aria-hidden />}
              </div>
              <div className="review-body">
                <div className="review-meta">
                  <span className="review-author">
                    {r.profile?.username ? (
                      <Link to={`/u/${r.profile.username}`}>@{r.profile.username}</Link>
                    ) : t('community:anon')}
                  </span>
                  <Stars value={r.rating} size={13} />
                  <span className="muted-text mono">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.comment && <p className="review-comment">{r.comment}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
