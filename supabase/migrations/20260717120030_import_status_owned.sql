-- ═══════════════════════════════════════════════════════════════════════════
-- 30) Jogos importados entram como "Na coleção" (owned), não "Quero jogar".
--   Feedback do Killer: a Steam trouxe 853 jogos como backlog e o progresso
--   virou "2/857 terminados (0%)". Importado = você TEM o jogo; status de
--   intenção (quero jogar/jogando) é escolha do usuário. Os importers novos
--   já gravam 'owned'; aqui o conserto do que já existe. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- só os criados por importer de BIBLIOTECA (steam/gog trazem a conta inteira);
-- não mexe em nada manual nem nos finished/playing dos provedores de troféu
update public.game_tracks
   set status = 'owned'
 where source in ('steam', 'gog')
   and status = 'backlog';
