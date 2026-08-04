// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: raspa LANÇAMENTOS da cena BR (fórum SMF).
//
// O RHDN morreu (dump congelado + bloqueia bot). A fonte VIVA e mais relevante
// pro hub PT-BR é o fórum romhacking.net.br (SMF), board "Lançamentos", que tem
// RSS. Esta função lê o RSS, extrai jogo/plataforma do título ("[SNES] Lufia 2"),
// tenta casar com um jogo do catálogo e grava em `scene_releases` (captura TUDO,
// mesmo sem match). No match confiável, cria também uma linha em `translations`
// (com página própria) — daí o backlog-digest já existente NOTIFICA sozinho quem
// tem o jogo no backlog. Idempotente (dedupe por source_url).
//
// Auth: x-cron-secret (cron) OU admin (teste manual). Segredos: CRON_SECRET.
// Deploy: supabase functions deploy scene-scrape --no-verify-jwt
// Cron (SQL Editor):
//   select public.setup_import_cron('scene-scrape',
//     'https://SEU-PROJETO.supabase.co/functions/v1/scene-scrape',
//     'SEU-CRON-SECRET', '{}'::jsonb, '30 8 * * *');
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const FORUM = 'https://www.romhacking.net.br';
const SOURCE = 'romhacking.net.br';

// tag de plataforma no título do fórum -> nosso nome curto
const PLAT: Record<string, string> = {
  snes: 'SNES', 'super nintendo': 'SNES', 'super famicom': 'SNES', sfc: 'SNES',
  nes: 'NES', 'nintendinho': 'NES', famicom: 'NES', nesw: 'NES',
  n64: 'N64', 'nintendo 64': 'N64', gc: 'GameCube', gamecube: 'GameCube',
  gb: 'Game Boy', gbc: 'GBC', gba: 'GBA', nds: 'NDS', ds: 'NDS', '3ds': '3DS',
  ps1: 'PS1', psx: 'PS1', ps2: 'PS2', ps3: 'PS3', psp: 'PSP', vita: 'PS Vita',
  'mega drive': 'Genesis', megadrive: 'Genesis', genesis: 'Genesis', md: 'Genesis',
  'master system': 'Master System', 'game gear': 'Game Gear', saturn: 'Saturn', dreamcast: 'Dreamcast',
  pc: 'PC', arcade: 'Arcade', wonderswan: 'WonderSwan', tg16: 'TG-16', 'pc engine': 'TG-16',
  switch: 'Switch', wii: 'Wii', xbox: 'Xbox', ps4: 'PS4',
};

const strip = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// variantes de numeral no fim do nome ("2" <-> "II") pra casar sequências
const ROMAN: Record<string, string> = { '2': 'ii', '3': 'iii', '4': 'iv', '5': 'v', '6': 'vi', '7': 'vii', '8': 'viii', '9': 'ix' };
const ARAB: Record<string, string> = Object.fromEntries(Object.entries(ROMAN).map(([a, r]) => [r, a]));
function variants(name: string): string[] {
  const n = norm(name);
  const out = new Set([n]);
  const parts = n.split(' ');
  const last = parts[parts.length - 1];
  if (ROMAN[last]) out.add([...parts.slice(0, -1), ROMAN[last]].join(' '));
  if (ARAB[last]) out.add([...parts.slice(0, -1), ARAB[last]].join(' '));
  return [...out].filter((x) => x.length >= 3);
}

function parseItems(xml: string): { title: string; link: string; pub: string | null }[] {
  const items: { title: string; link: string; pub: string | null }[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const b of blocks) {
    const seg = b.split(/<\/item>/i)[0];
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(seg);
      if (!m) return '';
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };
    const title = pick('title');
    const link = pick('link');
    const pub = pick('pubDate') || null;
    if (title && link) items.push({ title, link, pub });
  }
  return items;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);

    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    if (!isCron) {
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Apenas admins.' }, 403);
    }

    const boards: number[] = Array.isArray(body.boards) ? (body.boards as number[]) : [3];
    const stats = { vistos: 0, gravados: 0, casados: 0, traducoes: 0, pulados: 0 };
    const amostra: Record<string, unknown>[] = [];

    for (const board of boards) {
      const res = await fetch(`${FORUM}/index.php?action=.xml;type=rss2;board=${board}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (RomVault scene bot)' },
      });
      if (!res.ok) continue;
      const items = parseItems(await res.text());

      // 1 release por tópico (dedupe por id do tópico; tira "Res:" das respostas)
      const byTopic = new Map<string, { title: string; link: string; pub: string | null }>();
      for (const it of items) {
        const tid = /topic=(\d+)/.exec(it.link)?.[1];
        if (!tid) continue;
        const title = it.title.replace(/^\s*Res:\s*/i, '').trim();
        const isReply = /^\s*Res:/i.test(it.title);
        const prev = byTopic.get(tid);
        // prefere o item que NÃO é resposta (título do tópico); senão o primeiro
        if (!prev || (isReply === false)) byTopic.set(tid, { title, link: `${FORUM}/index.php?topic=${tid}.0`, pub: it.pub });
      }

      for (const [, rel] of byTopic) {
        stats.vistos++;
        // tag [PLAT] + nome
        const tag = /^\s*\[([^\]]+)\]\s*/.exec(rel.title);
        const platform = tag ? (PLAT[norm(tag[1])] ?? null) : null;
        let name = tag ? rel.title.slice(tag[0].length) : rel.title;
        name = name.replace(/\([^)]*\)/g, ' ').replace(/\s{2,}/g, ' ').trim(); // tira "(Dublado)" etc.
        const kind = /\bhack\b/i.test(rel.title) ? 'hack' : 'translation';
        const published = rel.pub ? new Date(rel.pub).toISOString() : null;

        // match best-effort: mesmo(s) variante(s) de nome + plataforma
        let gameId: string | null = null;
        let confident = false;
        let gameSlug: string | null = null, gameTitle: string | null = null;
        if (name.length >= 3) {
          const vs = variants(name);
          // busca pela palavra MAIS DISTINTIVA (evita a pontuação do título quebrar
          // o ILIKE: "Mortal Kombat: Shaolin Monks" casa por "shaolin"), depois
          // filtra por conter o nome inteiro normalizado.
          const words = norm(name).split(' ').filter((w) => w.length >= 4);
          const distinctive = (words.sort((a, b) => b.length - a.length)[0] ?? norm(name).split(' ')[0] ?? '').replace(/[%,()]/g, ' ');
          let q = admin.from('games').select('id, slug, title, platforms')
            .or(`title.ilike.%${distinctive}%,alt_search.ilike.%${distinctive}%`).limit(50);
          if (platform) q = q.contains('platforms', [platform]);
          const { data: cands } = await q;
          const list = (cands ?? []) as { id: string; slug: string; title: string; platforms: string[] | null }[];
          // candidato cujo título normalizado CONTÉM uma variante (o mais curto vence)
          const good = list
            .filter((g) => vs.some((v) => norm(g.title).includes(v)))
            .sort((a, b) => a.title.length - b.title.length);
          if (good[0]) {
            gameId = good[0].id; gameSlug = good[0].slug; gameTitle = good[0].title;
            confident = good.length === 1 || norm(good[0].title).startsWith(vs[0]);
          }
        }

        // grava em scene_releases (dedupe por source_url)
        const relRow: Record<string, unknown> = {
          source: SOURCE, source_url: rel.link, kind, title: rel.title.trim(),
          game_name: name || null, platform, language: 'Português (BR)', game_id: gameId, published_at: published,
        };

        // match confiável -> cria tradução (backlog-digest notifica) e aponta aqui
        let matchedTr: string | null = null;
        if (confident && gameId && kind === 'translation') {
          const { data: exTr } = await admin.from('translations').select('id').eq('source_url', rel.link).maybeSingle();
          if (exTr?.id) {
            matchedTr = exTr.id as string;
          } else {
            const { data: tr } = await admin.from('translations').insert({
              game_id: gameId, title: rel.title.trim(), language: 'Português (BR)',
              data_source: SOURCE, source_url: rel.link, is_public: true, release_date: published?.slice(0, 10) ?? null,
            }).select('id').single();
            if (tr?.id) { matchedTr = tr.id as string; stats.traducoes++; }
          }
        }
        if (matchedTr) relRow.matched_translation_id = matchedTr;

        const { error } = await admin.from('scene_releases').upsert(relRow, { onConflict: 'source_url', ignoreDuplicates: false });
        if (error) { stats.pulados++; continue; }
        stats.gravados++;
        if (gameId) stats.casados++;
        if (amostra.length < 8) amostra.push({ title: rel.title.trim(), platform, casou: gameTitle ?? '-', confiavel: confident });
      }
    }

    await admin.from('job_runs')
      .insert({ job: 'scene-scrape', mode: isCron ? 'cron' : 'manual', ok: true, stats })
      .then(() => {}, () => {});
    return json({ ok: true, ...stats, amostra });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
