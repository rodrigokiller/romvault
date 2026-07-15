import { describe, expect, it } from 'vitest';
import { slugify, slugifyText, stripDiacritics } from './slug';
import {
  findDuplicate,
  normalizeTitle,
  titleSimilarity,
  type DedupeTarget,
} from './dedupe';

describe('slug', () => {
  it('remove acentos', () => {
    expect(stripDiacritics('Coração Ilusão')).toBe('Coracao Ilusao');
  });
  it('gera slug seguro para URL', () => {
    expect(slugifyText('The Legend of Mana!')).toBe('the-legend-of-mana');
    expect(slugifyText('Final Fantasy VII')).toBe('final-fantasy-vii');
    expect(slugifyText("Marvel's Spider-Man")).toBe('marvels-spider-man');
    expect(slugifyText('Sonic & Knuckles')).toBe('sonic-and-knuckles');
    expect(slugifyText('  --Zelda--  ')).toBe('zelda');
  });
  it('sufixa a plataforma sem duplicar', () => {
    expect(slugify('Chrono Trigger', 'SNES')).toBe('chrono-trigger-snes');
    expect(slugify('Chrono Trigger', null)).toBe('chrono-trigger');
    expect(slugify('Chrono Trigger SNES', 'SNES')).toBe('chrono-trigger-snes');
  });
});

describe('titleSimilarity', () => {
  it('idênticos = 1', () => {
    expect(titleSimilarity('Legend of Mana', 'legend of mana')).toBe(1);
  });
  it('normaliza pontuação e acentos', () => {
    expect(normalizeTitle('The Legend of Mana!')).toBe('the legend of mana');
  });
  it('pequenas variações têm alta similaridade', () => {
    expect(titleSimilarity('Chrono Trigger', 'Chrono Triger')).toBeGreaterThan(0.85);
  });
  it('títulos distintos têm baixa similaridade', () => {
    expect(titleSimilarity('Chrono Trigger', 'Final Fantasy')).toBeLessThan(0.3);
  });
});

const existing: DedupeTarget[] = [
  {
    id: 'g1',
    igdb_id: 1022,
    external_ids: { igdb: 1022, mobygames: 'lom' },
    slug: 'legend-of-mana-psx',
    title: 'Legend of Mana',
    platforms: ['PSX'],
  },
  {
    id: 'g2',
    igdb_id: 1015,
    external_ids: { igdb: 1015 },
    slug: 'chrono-trigger-snes',
    title: 'Chrono Trigger',
    platforms: ['SNES'],
  },
];

describe('findDuplicate (cascata)', () => {
  it('1) casa por igdb_id', () => {
    const r = findDuplicate({ igdb_id: 1015, title: 'Qualquer Coisa' }, existing);
    expect(r).toEqual({ id: 'g2', matchType: 'igdb_id', confidence: 1 });
  });
  it('2) casa por external_ids quando não há igdb_id', () => {
    const r = findDuplicate(
      { external_ids: { mobygames: 'lom' }, title: 'Outro Nome' },
      existing,
    );
    expect(r.id).toBe('g1');
    expect(r.matchType).toBe('external_id');
  });
  it('3) casa por slug + plataforma', () => {
    const r = findDuplicate({ title: 'Legend of Mana', platform: 'PSX' }, existing);
    expect(r.id).toBe('g1');
    expect(r.matchType).toBe('slug_platform');
  });
  it('4) casa por título + plataforma quando o slug diverge', () => {
    const r = findDuplicate({ title: 'legend  of  mana', platform: 'PSX' }, [
      { ...existing[0], slug: 'slug-diferente' },
    ]);
    expect(r.matchType).toBe('title_platform');
  });
  it('5) casa por fuzzy acima do limiar', () => {
    const r = findDuplicate({ title: 'Chrono Triggr', platform: 'SNES' }, existing);
    expect(r.id).toBe('g2');
    expect(r.matchType).toBe('fuzzy');
    expect(r.confidence).toBeGreaterThan(0.82);
  });
  it('não casa nada distinto → none', () => {
    const r = findDuplicate({ title: 'Super Metroid', platform: 'SNES' }, existing);
    expect(r).toEqual({ id: null, matchType: 'none', confidence: 0 });
  });
  it('plataforma diferente evita falso positivo por fuzzy', () => {
    const r = findDuplicate({ title: 'Chrono Trigger', platform: 'PSX' }, existing);
    expect(r.matchType).toBe('none');
  });
});
