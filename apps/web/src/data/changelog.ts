/**
 * Changelog público (/novidades): mantido à mão, uma entrada por leva.
 * Datas em ISO; itens curtos, voltados pro usuário (não pro commit).
 */
export interface ChangelogEntry {
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-07-17',
    title: 'Site no ar + curadoria da comunidade',
    items: [
      'romvault.app no ar (deploy + domínio)',
      'Botão "Reportar problema" em jogos, hacks, traduções, docs e ferramentas',
      'Badges de plataforma na busca (Ctrl+K), clicáveis',
      'Sistema de convites do beta',
      'Página Sobre e este changelog',
    ],
  },
  {
    date: '2026-07-16',
    title: 'Contas vinculadas e sync automático',
    items: [
      'Vincule Steam, RetroAchievements, PlayStation, Xbox, GOG (e Nintendo em beta)',
      'Login direto pela Steam, sem precisar do SteamID',
      'Dados por conta na página do jogo: horas, conquistas, progresso',
      'Notificação "um jogo do seu backlog ganhou tradução" + digest por e-mail (opcional)',
      'Página /scene: as traduções e hacks mais zerados pela comunidade',
    ],
  },
  {
    date: '2026-07-15',
    title: 'Vitrine v2',
    items: [
      'Vitrine própria em /u/você/vitrine: grade natural estilo NSO, sem tarjas',
      'Vista Lombadas: sua coleção como prateleira real, por formato de caixa',
      'Arrastar pra reordenar (e botões no celular)',
      'Scans de caixa (frente, verso, mídia) na página do jogo',
    ],
  },
];
