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

export function ApiDocs() {
  const { t } = useTranslation();
  const base = env.configured ? `${env.supabaseUrl}/functions/v1/public-api` : 'https://<project>.supabase.co/functions/v1/public-api';

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
    </div>
  );
}
