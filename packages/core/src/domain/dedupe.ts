/**
 * Deduplicação de jogos ao ingerir de fontes externas (IGDB, etc.).
 *
 * A correspondência é uma CASCATA, do sinal mais forte ao mais fraco:
 *   1. igdb_id            (idêntico)                → confiança 1.00
 *   2. external_ids       (mesma fonte + id)        → confiança 0.98
 *   3. slug + plataforma  (slug canônico coincide)  → confiança 0.95
 *   4. título + plataforma (normalizados idênticos) → confiança 0.90
 *   5. fuzzy título       (similaridade ≥ limiar)   → confiança = similaridade
 *
 * A primeira etapa que casar vence. Nada casou → { id: null, matchType: 'none' }.
 */

import { slugify, stripDiacritics } from './slug';

export type MatchType =
  | 'igdb_id'
  | 'external_id'
  | 'slug_platform'
  | 'title_platform'
  | 'fuzzy'
  | 'none';

export interface DedupeCandidate {
  igdb_id?: number | null;
  external_ids?: Record<string, string | number> | null;
  title: string;
  platform?: string | null;
}

export interface DedupeTarget {
  id: string;
  igdb_id?: number | null;
  external_ids?: Record<string, string | number> | null;
  slug: string;
  title: string;
  platforms?: string[] | null;
}

export interface DedupeResult {
  id: string | null;
  matchType: MatchType;
  confidence: number;
}

const NONE: DedupeResult = { id: null, matchType: 'none', confidence: 0 };

/** Normaliza um título para comparação: sem acentos, minúsculo, só alfanumérico. */
export function normalizeTitle(title: string): string {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Conjunto de bigramas de caractere de uma string normalizada. */
function bigrams(value: string): Map<string, number> {
  const s = value.replace(/\s+/g, '');
  const map = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const gram = s.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

/**
 * Similaridade de Sørensen–Dice sobre bigramas de caractere (0..1).
 * Robusto a pequenas variações de grafia sem depender de biblioteca externa.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let intersection = 0;
  let sizeA = 0;
  for (const count of ga.values()) sizeA += count;
  let sizeB = 0;
  for (const count of gb.values()) sizeB += count;
  for (const [gram, countA] of ga) {
    const countB = gb.get(gram);
    if (countB) intersection += Math.min(countA, countB);
  }
  return (2 * intersection) / (sizeA + sizeB);
}

function samePlatform(candidate: string | null | undefined, platforms?: string[] | null): boolean {
  if (!candidate) return true; // candidato sem plataforma não restringe
  if (!platforms || platforms.length === 0) return false;
  const c = normalizeTitle(candidate);
  return platforms.some((p) => normalizeTitle(p) === c);
}

export interface DedupeOptions {
  /** Limiar mínimo de similaridade para aceitar um match fuzzy. */
  fuzzyThreshold?: number;
}

/**
 * Encontra o jogo existente correspondente a um candidato, ou NONE.
 * Percorre a cascata e devolve o primeiro acerto.
 */
export function findDuplicate(
  candidate: DedupeCandidate,
  existing: DedupeTarget[],
  options: DedupeOptions = {},
): DedupeResult {
  const fuzzyThreshold = options.fuzzyThreshold ?? 0.82;

  // 1) igdb_id
  if (candidate.igdb_id != null) {
    const hit = existing.find((g) => g.igdb_id != null && g.igdb_id === candidate.igdb_id);
    if (hit) return { id: hit.id, matchType: 'igdb_id', confidence: 1 };
  }

  // 2) external_ids (mesma fonte + mesmo id externo)
  if (candidate.external_ids) {
    for (const [source, extId] of Object.entries(candidate.external_ids)) {
      const hit = existing.find(
        (g) => g.external_ids != null && String(g.external_ids[source]) === String(extId),
      );
      if (hit) return { id: hit.id, matchType: 'external_id', confidence: 0.98 };
    }
  }

  // 3) slug + plataforma
  const candidateSlug = slugify(candidate.title, candidate.platform);
  const slugHit = existing.find((g) => g.slug === candidateSlug);
  if (slugHit) return { id: slugHit.id, matchType: 'slug_platform', confidence: 0.95 };

  // 4) título + plataforma (normalizados)
  const normCandidate = normalizeTitle(candidate.title);
  const titleHit = existing.find(
    (g) => normalizeTitle(g.title) === normCandidate && samePlatform(candidate.platform, g.platforms),
  );
  if (titleHit) return { id: titleHit.id, matchType: 'title_platform', confidence: 0.9 };

  // 5) fuzzy (melhor similaridade acima do limiar, respeitando plataforma)
  let best: DedupeResult = NONE;
  for (const g of existing) {
    if (!samePlatform(candidate.platform, g.platforms)) continue;
    const sim = titleSimilarity(candidate.title, g.title);
    if (sim >= fuzzyThreshold && sim > best.confidence) {
      best = { id: g.id, matchType: 'fuzzy', confidence: Number(sim.toFixed(4)) };
    }
  }
  return best;
}
