import { useTranslation } from 'react-i18next';
import { env } from '@/lib/env';

const ENDPOINTS: { method: string; path: string; desc: string }[] = [
  { method: 'GET', path: '/games?limit=20&offset=0&q=zelda&platform=SNES', desc: 'List games (paginated, searchable)' },
  { method: 'GET', path: '/games/:slug', desc: 'One game by slug' },
  { method: 'GET', path: '/romhacks?game=:gameId&limit=20', desc: 'Romhacks (optionally by game)' },
  { method: 'GET', path: '/translations?game=:gameId', desc: 'Translations (optionally by game)' },
  { method: 'GET', path: '/documents?game=:gameId', desc: 'Documents' },
  { method: 'GET', path: '/tools', desc: 'Tools' },
];

const LIB_ENDPOINTS: { method: string; path: string; desc: string }[] = [
  { method: 'GET', path: '/?updated_since=<ISO>&cursor=<n>&limit=500', desc: 'Your library/tracking (delta + paginated) → { items, next_cursor? }' },
  { method: 'POST', path: '/', desc: 'Upsert ONE game (match by title, platform breaks ties) → final object' },
  { method: 'POST', path: '/bulk', desc: 'Upsert an array → { added, updated, conflicts, unchanged, unmatched }' },
];

export function ApiDocs() {
  const { t } = useTranslation();
  const base = env.configured ? `${env.supabaseUrl}/functions/v1/public-api` : 'https://<project>.supabase.co/functions/v1/public-api';
  const libBase = env.configured ? `${env.supabaseUrl}/functions/v1/library-api` : 'https://<project>.supabase.co/functions/v1/library-api';

  return (
    <div className="container container-narrow">
      <header className="page-head">
        <span className="kicker">// API</span>
        <h1>{t('apidocs:title')}</h1>
        <p className="page-sub">{t('apidocs:intro')}</p>
      </header>

      <section className="section" style={{ marginTop: 'var(--s4)' }}>
        <h2>{t('apidocs:baseTitle')}</h2>
        <pre className="code-block">{base}</pre>
      </section>

      <section className="section">
        <h2>{t('apidocs:authTitle')}</h2>
        <p className="muted-text">{t('apidocs:authText')}</p>
        <pre className="code-block">{`x-api-key: rv_xxxxxxxxxxxxxxxx`}</pre>
        <p className="muted-text">{t('apidocs:authManage')}</p>
      </section>

      <section className="section">
        <h2>{t('apidocs:endpointsTitle')}</h2>
        <div className="api-endpoints">
          {ENDPOINTS.map((e) => (
            <div key={e.path} className="api-endpoint">
              <span className="api-method">{e.method}</span>
              <code className="api-path">{e.path}</code>
              <span className="api-desc muted-text">{e.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>{t('apidocs:exampleTitle')}</h2>
        <pre className="code-block">{`curl "${base}/games?q=metroid&limit=5" \\
  -H "x-api-key: rv_xxxxxxxxxxxxxxxx"`}</pre>
      </section>

      <section className="section">
        <h2>{t('apidocs:notesTitle')}</h2>
        <ul className="api-notes">
          <li>{t('apidocs:noteRead')}</li>
          <li>{t('apidocs:noteDeploy')}</li>
        </ul>
      </section>

      <section className="section" style={{ marginTop: 'var(--s5)' }}>
        <span className="kicker">// {t('apidocs:libKicker')}</span>
        <h2>{t('apidocs:libTitle')}</h2>
        <p className="page-sub">{t('apidocs:libIntro')}</p>
        <pre className="code-block">{libBase}</pre>
        <p className="muted-text">{t('apidocs:libAuth')}</p>
        <pre className="code-block">{`Authorization: Bearer rv_xxxxxxxxxxxxxxxx`}</pre>
        <div className="api-endpoints">
          {LIB_ENDPOINTS.map((e) => (
            <div key={e.method + e.path} className="api-endpoint">
              <span className="api-method">{e.method}</span>
              <code className="api-path">{e.path}</code>
              <span className="api-desc muted-text">{e.desc}</span>
            </div>
          ))}
        </div>
        <p className="muted-text" style={{ marginTop: 'var(--s3)' }}>{t('apidocs:libShape')}</p>
        <pre className="code-block">{`{
  "id": "…", "chave": "ps1|final fantasy vii",
  "titulo": "Final Fantasy VII", "plataforma": "PS1", "regiao": "USA",
  "possui": true, "status": "beaten", "horas": 42,
  "capa_url": "https://…", "atualizado_em": "2026-07-28T12:00:00Z"
}`}</pre>
        <pre className="code-block">{`curl "${libBase}?limit=3" \\
  -H "Authorization: Bearer rv_xxxxxxxxxxxxxxxx"`}</pre>
      </section>
    </div>
  );
}
