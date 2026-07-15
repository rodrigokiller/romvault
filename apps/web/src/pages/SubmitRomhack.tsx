import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * Formulário de EXEMPLO com react-hook-form + zod (fixando o padrão).
 * As mensagens de validação vêm do i18n. Nada é persistido ainda.
 */
export function SubmitRomhack() {
  const { t } = useTranslation();
  const toast = useToast();

  // Schema recriado quando o idioma muda, para mensagens localizadas.
  const schema = useMemo(
    () =>
      z.object({
        title: z.string().min(3, t('forms:valTitleMin')),
        game: z.string().min(1, t('forms:valGameRequired')),
        category: z.string().min(1, t('forms:valCategoryRequired')),
        version: z.string().min(1, t('forms:valVersionRequired')),
        description: z.string().min(20, t('forms:valDescMin')),
        fileUrl: z.string().url(t('forms:valUrlInvalid')),
      }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      game: '',
      category: '',
      version: '',
      description: '',
      fileUrl: '',
    },
  });

  function onSubmit(_values: FormValues) {
    // Demo: apenas confirma a validação; a persistência chega depois.
    toast.success(t('forms:success'));
    reset();
  }

  return (
    <div className="container">
      <header className="page-head">
        <span className="kicker">// {t('nav:submit')}</span>
        <h1>{t('forms:submitTitle')}</h1>
        <p className="page-sub">{t('forms:submitSubtitle')}</p>
      </header>

      <Card style={{ maxWidth: 640 }}>
        <form
          onSubmit={handleSubmit(onSubmit)}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}
          noValidate
        >
          <Field label={t('forms:fieldTitle')} error={errors.title?.message}>
            {(id) => (
              <Input id={id} placeholder={t('forms:phTitle')} hasError={!!errors.title} {...register('title')} />
            )}
          </Field>

          <Field label={t('forms:fieldGame')} error={errors.game?.message}>
            {(id) => (
              <Input id={id} placeholder={t('forms:phGame')} hasError={!!errors.game} {...register('game')} />
            )}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s4)' }}>
            <Field label={t('forms:fieldCategory')} error={errors.category?.message}>
              {(id) => (
                <Select id={id} hasError={!!errors.category} defaultValue="" {...register('category')}>
                  <option value="" disabled>
                    {t('forms:catChoose')}
                  </option>
                  <option value="gameplay">{t('forms:catGameplay')}</option>
                  <option value="difficulty">{t('forms:catDifficulty')}</option>
                  <option value="story">{t('forms:catStory')}</option>
                  <option value="graphics">{t('forms:catGraphics')}</option>
                  <option value="bugfix">{t('forms:catBugfix')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('forms:fieldVersion')} error={errors.version?.message}>
              {(id) => (
                <Input id={id} placeholder={t('forms:phVersion')} hasError={!!errors.version} {...register('version')} />
              )}
            </Field>
          </div>

          <Field label={t('forms:fieldDescription')} error={errors.description?.message}>
            {(id) => (
              <Textarea
                id={id}
                placeholder={t('forms:phDescription')}
                hasError={!!errors.description}
                {...register('description')}
              />
            )}
          </Field>

          <Field label={t('forms:fieldFileUrl')} error={errors.fileUrl?.message}>
            {(id) => (
              <Input id={id} placeholder={t('forms:phFileUrl')} hasError={!!errors.fileUrl} {...register('fileUrl')} />
            )}
          </Field>

          <p className="field-hint">{t('forms:authNote')}</p>

          <div style={{ display: 'flex', gap: 'var(--s2)', justifyContent: 'flex-end' }}>
            <Button type="button" variant="ghost" onClick={() => reset()}>
              {t('forms:actionReset')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {t('forms:actionSubmit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
