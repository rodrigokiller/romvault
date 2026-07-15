# Bancos de capas / box art para o ROMVault — brief verificado (jul/2026)

Pesquisa feita com verificação direta das fontes em 14-15/07/2026. Onde não foi
possível confirmar (ex.: docs bloqueadas por Cloudflare), está dito explicitamente.

## 1. SteamGridDB (steamgriddb.com)
- Assets DIGITAIS da comunidade (não scans): grids 460×215/920×430 e verticais
  600×900 estilo capa, heroes, logos PNG, icons.
- Forte em PC/modernos; aceita IDs Steam/EGS/GOG/EA/Ubisoft + IDs próprios.
  Os "covers" 600×900 são arte estilizada, NÃO a caixa real.
- API gratuita (conta + key, Bearer, base /api/v2). Rate limit não documentado.
- Sem bulk. Bom como fallback visual p/ modernos.

## 2. libretro-thumbnails (thumbnails.libretro.com) ★ MELHOR RETRÔ
- PNGs por sistema: Named_Boxarts (capa 2D frontal), Named_Snaps, Named_Titles,
  Named_Logos. Só frente da caixa.
- ~130 sistemas (Atari 2600 → PS4/X360/Wii U, MAME/FBNeo, ScummVM).
- NÃO é API: CDN estático GRÁTIS, sem chave, URL previsível:
  https://thumbnails.libretro.com/{Fabricante - Sistema}/Named_Boxarts/{Nome}.png
- Nomes seguem labels No-Intro/Redump com caracteres &*/:`<>?\|" trocados por _.
- BULK total e grátis: git clone dos submódulos por sistema.

## 3. TheGamesDB (thegamesdb.net)
- Boxart FRENTE E VERSO, screenshots, fanart, clearlogo.
- API v1 com key gratuita; allowance mensal (~1.500/mês pública; privada 6.000
  que nunca reseta, pensada p/ sync único + updates). Política mudou 02/2026.
- Sem dump. Usar para complementar (verso da caixa), não como fonte de massa.

## 4. MobyGames (mobygames.com)
- Scans de capa POR RELEASE/REGIÃO (frente/verso/mídia), qualidade curada.
- API PAGA (mar/2025): Hobbyist US$9,99/mês (0,2 req/s), comercial de US$99,99
  a US$4.999,99/mês. Grátis só p/ pesquisa via formulário. Sem bulk.
- Ruim para pipeline automatizado gratuito; tratar como curadoria manual.

## 5. ScreenScraper.fr ★ MAIS RICO RETRÔ (com burocracia)
- box-2D frente/verso/lateral, box-3D, foto do cartucho/disco, wheel/logo,
  marquee, fanart, tela de título, mixes, MANUAIS EM PDF, vídeos — por região.
- API gratuita mas dupla credencial: devid+devpassword (aprovação da equipe)
  + ssid/sspassword do usuário. jeuInfos.php casa por HASH da ROM (CRC/MD5/
  SHA1) — match perfeito; jeuRecherche.php por título.
- ~20k req/dia, 1 thread (doadores ganham threads). Sem dump.
- A fonte mais rica SE houver hash das ROMs.

## 6. IGDB (já usado)
- URL de imagem montável em QUALQUER tamanho: t_cover_big, t_720p, t_1080p e
  sufixo _2x (retina) sobre o mesmo image_id. /v4/artworks (heroes/fundos) e
  /v4/screenshots no mesmo token. 4 req/s.
- Capas são arte digital de loja, não scan físico; retrô irregular.

## 7. Scans de caixa física / manuais
- Internet Archive (API pública, bulk livre): softwareboxart, HQ Retro Games
  Box Art (big boxes), Lugamo's Redump Scans, Unofficial Redump Hoard.
  Nomenclatura heterogênea → curadoria, não matching automático.
- The Cover Project: capas imprimíveis completas (frente+lombada+verso), sem
  API/bulk → scrape. VGBoxArt: fan-made, não usar como capa autêntica.

## Recomendação prática

**(a) Retrô:**
1. PRIMÁRIA: libretro-thumbnails como CDN estático. Mapear plataforma → pasta
   libretro; baixar a LISTAGEM de Named_Boxarts por sistema e montar índice
   `chave_normalizada → arquivo exato` (não chutar URL). Normalização No-Intro:
   minúsculas, sem acentos, &*/:`<>?\|" → _, artigos ("The X" ↔ "X, The"),
   tentar (i) nome com região (USA)/(Europe), (ii) sem parênteses, (iii) fuzzy.
   Copiar o PNG pro NOSSO storage (não hotlinkar).
2. FALLBACK RICO: ScreenScraper quando houver hash de ROM (box-3D, verso,
   cartucho, manual PDF). Requer devid + quota 20k/dia.
3. VERSO pontual: TheGamesDB (chave privada p/ sync inicial).

**(b) Modernos:**
1. IGDB com t_cover_big_2x / t_720p + /v4/artworks para heroes.
2. Fallback: SteamGridDB 600×900 (rotular como "arte alternativa").
3. MobyGames só com orçamento.

**Regra geral:** cachear tudo no nosso storage com atribuição da fonte; só
libretro-thumbnails e Internet Archive permitem bulk explícito.

## Fontes
- https://www.steamgriddb.com/api/v2 · https://github.com/SteamGridDB/node-steamgriddb
- https://thumbnails.libretro.com/ · https://github.com/libretro-thumbnails/libretro-thumbnails
- https://docs.libretro.com/guides/roms-playlists-thumbnails/
- https://api.thegamesdb.net/ · https://forums.thegamesdb.net/viewtopic.php?t=60
- https://www.mobygames.com/api/subscribe/ · https://www.mobygames.com/mobyplus/
- https://api.screenscraper.fr/ · https://gemba.github.io/skyscraper/SCRAPINGMODULES/
- https://api-docs.igdb.com/ · https://github.com/Henry-Sarabia/igdb/blob/master/image.go
- https://archive.org/details/softwareboxart · https://archive.org/details/hq.retro.games.box.art
- https://archive.org/details/lugamo_redump_scans · https://www.thecoverproject.net/
