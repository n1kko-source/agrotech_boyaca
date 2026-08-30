/** Accent-fold + lowercase, matching Postgres `unaccent` + ILIKE-style compare. */
export function unaccent(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .toLowerCase();
}

function trigrams(input: string): Set<string> {
  const padded = `  ${input} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity of trigrams — same idea as `pg_trgm.similarity`. */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }
  const left = trigrams(a);
  const right = trigrams(b);
  let inter = 0;
  for (const gram of left) {
    if (right.has(gram)) {
      inter += 1;
    }
  }
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Best trigram match of `needle` against any whitespace token in `haystack`. */
export function wordSimilarity(needle: string, haystack: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let best = similarity(needle, haystack);
  for (const token of tokenize(haystack)) {
    const score = similarity(needle, token);
    if (score > best) {
      best = score;
    }
  }
  return best;
}

const FUZZY_MIN = 0.2;

export type WeightedFields = {
  a: string[];
  b: string[];
};

function tokenize(input: string): string[] {
  return unaccent(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .map(stemEs);
}

function stemEs(token: string): string {
  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

function ftsOverlap(queryTokens: string[], fields: WeightedFields): number {
  if (queryTokens.length === 0) {
    return 0;
  }
  const titleTokens = new Set(fields.a.flatMap(tokenize));
  const bodyTokens = new Set(fields.b.flatMap(tokenize));
  let weight = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) {
      weight += 1;
    } else if (bodyTokens.has(token)) {
      weight += 0.4;
    }
  }
  return Math.min(1, weight / queryTokens.length);
}

function bestFuzzy(query: string, fields: WeightedFields): number {
  let best = 0;
  for (const field of fields.a) {
    const folded = unaccent(field);
    best = Math.max(
      best,
      similarity(folded, query),
      wordSimilarity(query, folded),
    );
  }
  return best;
}

function bestBodyFuzzy(query: string, fields: WeightedFields): number {
  let best = 0;
  for (const field of fields.b) {
    best = Math.max(best, wordSimilarity(query, unaccent(field)));
  }
  return best;
}

/**
 * In-memory ranking used when Postgres is not available (e2e / unit).
 * Mirrors ts_rank_cd on A/B weights plus pg_trgm similarity.
 */
export function rankDocument(query: string, fields: WeightedFields): number {
  const folded = unaccent(query).trim();
  if (folded.length === 0) {
    return 0;
  }
  const fts = ftsOverlap(tokenize(folded), fields);
  const fuzzyA = bestFuzzy(folded, fields);
  if (fts < 0.05 && fuzzyA < FUZZY_MIN) {
    return 0;
  }
  const fuzzy = Math.max(fuzzyA, bestBodyFuzzy(folded, fields));
  return fts * 2 + fuzzy;
}
