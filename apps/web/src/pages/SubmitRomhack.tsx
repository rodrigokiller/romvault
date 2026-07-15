import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Wrench, Languages, FileText, Hammer, Upload, X, Gamepad2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { useGames } from '@/hooks/useGames';
import { useDebounce } from '@/hooks/useDebounce';
import { useUploadFile, useCreateMaterial } from '@/hooks/useMutations';
import type { MaterialKind } from '@/hooks/useMaterials';

type SubmitKind = 'romhack' | 'translation' | 'document' | 'tool';
type GameNeed = 'required' | 'optional' | 'none';

interface TypeCfg {
  kind: SubmitKind;
  table: MaterialKind;
  route: string;
  icon: typeof Wrench;
  game: GameNeed;
}

const TYPES: TypeCfg[] = [
  { kind: 'romhack', table: 'romhacks', route: 'romhacks', icon: Wrench, game: 'required' },
  { kind: 'translation', table: 'translations', route: 'translations', icon: Languages, game: 'required' },
  { kind: 'document', table: 'documents', route: 'docs', icon: FileText, game: 'optional' },
  { kind: 'tool', table: 'tools', route: 'tools', icon: Hammer, game: 'none' },
];

interface SubmitValues {
  title: string;
  description: string;
  version?: string;
  category?: string;
  difficulty?: string;
  patch_type?: string;
  language?: string;
  source_language?: string;
  completion_percentage?: number;
  file_format?: string;
  license?: string;
  source_code_url?: string;
  file_url?: string;
}

function buildSchema(cfg: TypeCfg, t: (k: string) => string) {
  const url = z.string().url(t('forms:valUrlInvalid')).optional().or(z.literal(''));
  return z.object({
    title: z.string().min(3, t('forms:valTitleMin')),
    description: z.string().min(20, t('forms:valDescMin')),
    version: z.string().optional(),
    category: z.string().optional(),
    difficulty: z.string().optional(),
    patch_type: z.string().optional(),
    language: cfg.kind === 'translation'
      ? z.string().min(1, t('forms:valLanguageRequired'))
      : z.string().optional(),
    source_language: z.string().optional(),
    completion_percentage: z.coerce.number().min(0).max(100).optional(),
    file_format: z.string().optional(),
    license: z.string().optional(),
    source_code_url: url,
    file_url: url,
  });
}

/* ── Seletor de jogo de origem (busca com debounce) ─────────────────────────── */
function GamePicker({
  need,
  value,
  onChange,
}: {
  need: GameNeed;
  value: { id: string; title: string } | null;
  onChange: (g: { id: string; title: string } | null) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q, 220);
  const { data: games = [] } = useGames({ search: debounced });

  if (value) {
    return (
      <div className="game-picked">
        <Gamepad2 aria-hidden />
        <span className="game-picked-title">{value.title}</span>
        <button type="button" className="game-picked-clear" onClick={() => onChange(null)} aria-label={t('forms:clearGame')}>
          <X aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="game-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Input
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={need === 'optional' ? t('forms:phSearchGameOpt') : t('forms:phSearchGame')}
      />
      {open && debounced.length >= 2 && games.length > 0 && (
        <div className="game-picker-drop">
          {games.slice(0, 8).map((g) => (
            <button
              key={g.id}
              type="button"
              className="game-picker-item"
              onMouseDown={(e) => { e.preventDefault(); onChange({ id: g.id, title: g.title }); setOpen(false); setQ(''); }}
            >
              <span>{g.title}</span>
              {g.platforms?.[0] && <span className="chip">{g.platforms[0]}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Formulário de um tipo (remontado ao trocar de tipo) ────────────────────── */
function MaterialForm({ cfg }: { cfg: TypeCfg }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const upload = useUploadFile();
  const create = useCreateMaterial(cfg.table);
  const [game, setGame] = useState<{ id: string; title: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [gameError, setGameError] = useState(false);

  const schema = useMemo(() => buildSchema(cfg, t), [cfg, t]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubmitValues>({
    resolver: zodResolver(schema) as unknown as Resolver<SubmitValues>,
    defaultValues: { title: '', description: '' },
  });

  async function onSubmit(values: SubmitValues) {
    if (cfg.game === 'required' && !game) { setGameError(true); return; }
    try {
      let fileUrl = values.file_url || null;
      if (file) fileUrl = await upload(file, cfg.table);

      const row: Record<string, unknown> = {
        title: values.title,
        description: values.description,
        version: values.version || null,
        tags: [],
        file_url: fileUrl,
        is_public: true,
      };
      if (game) row.game_id = game.id;

      if (cfg.kind === 'romhack') {
        row.categories = values.category ? [values.category] : [];
        row.difficulty = values.difficulty || null;
        row.patch_type = values.patch_type || null;
      } else if (cfg.kind === 'translation') {
        row.categories = values.category ? [values.category] : [];
        row.language = values.language || null;
        row.source_language = values.source_language || null;
        row.completion_percentage = values.completion_percentage ?? null;
        row.patch_type = values.patch_type || null;
      } else if (cfg.kind === 'document') {
        row.category = values.category || null;
        row.file_format = values.file_format || null;
        row.language = values.language || null;
      } else if (cfg.kind === 'tool') {
        row.category = values.category || null;
        row.license = values.license || null;
        row.source_code_url = values.source_code_url || null;
      }

      const { id } = await create.mutateAsync(row);
      toast.success(t('forms:submittedOk'));
      navigate(`/${cfg.route}/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('forms:submitError'));
    }
  }

  return (
    <Card style={{ maxWidth: 680 }}>
      <form onSubmit={handleSubmit(onSubmit)} className="submit-form" noValidate>
        {cfg.game !== 'none' && (
          <Field
            label={cfg.game === 'optional' ? t('forms:fieldGameOpt') : t('forms:fieldGame')}
            error={gameError ? t('forms:valGameRequired') : undefined}
          >
            {() => <GamePicker need={cfg.game} value={game} onChange={(g) => { setGame(g); setGameError(false); }} />}
          </Field>
        )}

        <Field label={t('forms:fieldTitle')} error={errors.title?.message}>
          {(id) => <Input id={id} placeholder={t('forms:phTitle')} hasError={!!errors.title} {...register('title')} />}
        </Field>

        <Field label={t('forms:fieldDescription')} error={errors.description?.message}>
          {(id) => <Textarea id={id} placeholder={t('forms:phDescription')} hasError={!!errors.description} {...register('description')} />}
        </Field>

        <div className="submit-grid">
          {(cfg.kind === 'romhack' || cfg.kind === 'translation') && (
            <Field label={t('forms:fieldVersion')}>
              {(id) => <Input id={id} placeholder={t('forms:phVersion')} {...register('version')} />}
            </Field>
          )}

          {cfg.kind === 'translation' && (
            <>
              <Field label={t('forms:fieldLanguage')} error={errors.language?.message}>
                {(id) => <Input id={id} placeholder="Português (BR)" hasError={!!errors.language} {...register('language')} />}
              </Field>
              <Field label={t('forms:fieldSourceLanguage')}>
                {(id) => <Input id={id} placeholder="Inglês" {...register('source_language')} />}
              </Field>
              <Field label={t('forms:fieldCompletion')}>
                {(id) => <Input id={id} type="number" min={0} max={100} placeholder="100" {...register('completion_percentage')} />}
              </Field>
            </>
          )}

          {cfg.kind === 'romhack' && (
            <Field label={t('forms:fieldDifficulty')}>
              {(id) => (
                <Select id={id} defaultValue="" {...register('difficulty')}>
                  <option value="">—</option>
                  {['Easy', 'Normal', 'Hard', 'Very Hard', 'Kaizo'].map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              )}
            </Field>
          )}

          {(cfg.kind === 'romhack' || cfg.kind === 'translation') && (
            <Field label="Patch">
              {(id) => (
                <Select id={id} defaultValue="" {...register('patch_type')}>
                  <option value="">—</option>
                  {['IPS', 'UPS', 'BPS', 'Xdelta', 'PPF'].map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              )}
            </Field>
          )}

          {cfg.kind === 'document' && (
            <Field label={t('forms:fieldFileFormat')}>
              {(id) => (
                <Select id={id} defaultValue="" {...register('file_format')}>
                  <option value="">—</option>
                  {['PDF', 'HTML', 'TXT', 'MD'].map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              )}
            </Field>
          )}

          {(cfg.kind === 'document') && (
            <Field label={t('forms:fieldLanguage')}>
              {(id) => <Input id={id} placeholder="Português (BR)" {...register('language')} />}
            </Field>
          )}

          {cfg.kind === 'tool' && (
            <>
              <Field label={t('forms:fieldLicense')}>
                {(id) => <Input id={id} placeholder="Free / GPL / MIT" {...register('license')} />}
              </Field>
              <Field label={t('forms:fieldSourceUrl')} error={errors.source_code_url?.message}>
                {(id) => <Input id={id} placeholder="https://github.com/…" {...register('source_code_url')} />}
              </Field>
            </>
          )}

          <Field label={t('forms:fieldCategory')}>
            {(id) => <Input id={id} placeholder={t('forms:phCategory')} {...register('category')} />}
          </Field>
        </div>

        {/* Arquivo: upload OU URL */}
        <Field label={t('forms:fieldFileUpload')}>
          {(id) => (
            <input
              id={id}
              type="file"
              className="file-input"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        <div className="submit-or">{t('auth:or')}</div>
        <Field label={t('forms:fieldFileUrl')} error={errors.file_url?.message}>
          {(id) => <Input id={id} placeholder={t('forms:phFileUrl')} hasError={!!errors.file_url} {...register('file_url')} />}
        </Field>

        <div className="submit-actions">
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            <Upload /> {t('forms:actionSubmit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SubmitRomhack() {
  const { t } = useTranslation();
  const { user, disabled } = useAuth();
  const [kind, setKind] = useState<SubmitKind>('romhack');
  const cfg = TYPES.find((x) => x.kind === kind) as TypeCfg;

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('nav:submit')}</span>
        <h1>{t('forms:submitTitle')}</h1>
        <p className="page-sub">{t('forms:submitSubtitleReal')}</p>
      </header>

      {!user && !disabled && (
        <div className="config-banner" style={{ marginBottom: 'var(--s5)' }}>
          {t('forms:mustLogin')}
        </div>
      )}

      <div className="type-seg" role="tablist" aria-label={t('forms:typeLabel')}>
        {TYPES.map(({ kind: k, icon: Icon }) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={k === kind}
            className={`type-seg-btn ${k === kind ? 'is-active' : ''}`}
            onClick={() => setKind(k)}
          >
            <Icon aria-hidden /> {t(`forms:type_${k}`)}
          </button>
        ))}
      </div>

      <MaterialForm key={kind} cfg={cfg} />
    </div>
  );
}
