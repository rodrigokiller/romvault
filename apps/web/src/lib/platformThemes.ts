/**
 * Cor-tema por plataforma: a "cara" de cada console. Usada pela estante
 * (Library) e pela Vitrine para accent de borda/hover/badges/fundo.
 * Cobre TODAS as plataformas do catálogo (PLATFORM_SHORT do importer +
 * extras dos parsers RHDN/pobre).
 */
export const PLATFORM_THEMES: Record<string, string> = {
  // Nintendo — consoles
  NES: '#e05a5a', SNES: '#a191dd', N64: '#3aa655', GameCube: '#7a5fd0',
  Wii: '#9db7d4', 'Wii U': '#1fa8c9', Switch: '#e60012', 'Switch 2': '#e60012',
  FDS: '#c9302c', 'Virtual Boy': '#d43b3b',
  // Nintendo — portáteis
  'Game Boy': '#8bac0f', GBC: '#7b4fd8', GBA: '#5c67d8', NDS: '#8f9aa6', '3DS': '#d94a4a',
  // Sega
  Genesis: '#3b6fd4', 'Master System': '#d43b3b', 'Game Gear': '#333c8f',
  'Sega CD': '#4a90d9', '32X': '#e0b52e', Saturn: '#5b7d9e', Dreamcast: '#f0862e',
  // Sony
  PS1: '#8f9aa6', PS2: '#3b53a8', PS3: '#5b6f8f', PS4: '#2e6db4', PS5: '#e8ecf2',
  PSP: '#4a5d78', 'PS Vita': '#2e6db4',
  // Microsoft
  Xbox: '#107c10', 'Xbox 360': '#7ab648', 'Xbox One': '#107c10', 'Xbox Series': '#107c10',
  // Computadores
  PC: '#66c0f4', DOS: '#c4b26a', Mac: '#a8b0bd', Linux: '#e8a33d',
  Amiga: '#c8563b', C64: '#8a7a5c', MSX: '#3b6fd4',
  // Clássicos / outros
  Arcade: '#f0c02e', 'TG-16': '#f07d2e', 'Neo Geo': '#2e6db4', 'Neo Geo Pocket': '#2e6db4',
  'Atari 2600': '#c9613b', Jaguar: '#c93a3a', '3DO': '#d4a72e',
  ColecoVision: '#5b6f8f', Intellivision: '#8a6d4a', WonderSwan: '#7b8f9e',
  // Mobile
  Android: '#3ddc84', iOS: '#66a8f4',
};

/**
 * Família de caixa por plataforma — decide o FORMATO da lombada na vista
 * "Lombadas" da vitrine:
 *   carton     = papelão estilo VHS (Nintendo cartucho, computadores antigos)
 *   clamshell  = estojo plástico da Sega (Genesis/Master System)
 *   jewel      = CD jewel case (PS1, Saturn, Dreamcast, PC em CD)
 *   dvd        = caixa de DVD (PS2, GameCube, Xbox, Wii)
 *   bluray     = caixa fina de bluray (PS3 em diante)
 *   switchcase = caixinha baixa do Switch
 *   ds         = caixinha de portátil (DS/3DS/PSP/Vita/WonderSwan)
 *   digital    = sem caixa física (Arcade, mobile) — lombada fininha neutra
 */
export const SPINE_FAMILY: Record<string, string> = {
  // papelão (cartucho Nintendo + computadores de disquete)
  NES: 'carton', SNES: 'carton', N64: 'carton', 'Game Boy': 'carton', GBC: 'carton',
  GBA: 'carton', FDS: 'carton', 'Virtual Boy': 'carton',
  DOS: 'carton', Amiga: 'carton', C64: 'carton', MSX: 'carton',
  'Atari 2600': 'carton', Jaguar: 'carton', ColecoVision: 'carton', Intellivision: 'carton',
  'Neo Geo': 'carton', // shockbox do AES é um caixotão plástico, formato próximo
  // estojo plástico Sega
  Genesis: 'clamshell', 'Master System': 'clamshell', 'Game Gear': 'clamshell', '32X': 'clamshell',
  // CD jewel
  PS1: 'jewel', 'Sega CD': 'jewel', Saturn: 'jewel', Dreamcast: 'jewel',
  PC: 'jewel', Mac: 'jewel', Linux: 'jewel', 'TG-16': 'jewel', '3DO': 'jewel',
  // DVD
  PS2: 'dvd', GameCube: 'dvd', Xbox: 'dvd', 'Xbox 360': 'dvd', Wii: 'dvd', 'Wii U': 'dvd',
  // bluray
  PS3: 'bluray', PS4: 'bluray', PS5: 'bluray', 'Xbox One': 'bluray', 'Xbox Series': 'bluray',
  // caixinha Switch
  Switch: 'switchcase', 'Switch 2': 'switchcase',
  // portáteis
  NDS: 'ds', '3DS': 'ds', 'PS Vita': 'ds', PSP: 'ds', WonderSwan: 'ds', 'Neo Geo Pocket': 'ds',
  // sem caixa
  Arcade: 'digital', Android: 'digital', iOS: 'digital',
};
