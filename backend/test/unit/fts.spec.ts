import {
  rankDocument,
  similarity,
  unaccent,
  wordSimilarity,
} from '../../src/comunidad/search/fts';

describe('FTS helpers', () => {
  it('folds Spanish accents the same way unaccent does', () => {
    expect(unaccent('Papá')).toBe('papa');
    expect(unaccent('Siachoque')).toBe('siachoque');
    expect(unaccent('maíz')).toBe('maiz');
  });

  it('gives high trigram similarity for a one-letter typo', () => {
    expect(similarity('cebolla', 'ceblla')).toBeGreaterThan(0.3);
    expect(similarity('zanahoria', 'zanahria')).toBeGreaterThan(0.3);
  });

  it('matches a typo against a word inside a longer description', () => {
    expect(
      wordSimilarity('ceblla', 'oferta de cebolla pastusa en siachoque'),
    ).toBeGreaterThan(0.3);
  });

  it('ranks a title hit above a description-only mention', () => {
    const titleHit = rankDocument('papa criolla', {
      a: ['Venta de papa criolla', 'papa'],
      b: ['Cosecha de esta semana en Siachoque'],
    });
    const descHit = rankDocument('papa criolla', {
      a: ['Transporte de carga', 'logistica'],
      b: ['Llevo papa criolla a Tunja los jueves'],
    });
    expect(titleHit).toBeGreaterThan(descHit);
    expect(titleHit).toBeGreaterThan(0);
    expect(descHit).toBeGreaterThan(0);
  });

  it('treats papá as a match for papa (unaccent)', () => {
    const rank = rankDocument('papá', {
      a: ['Venta de papa pastusa', 'papa'],
      b: ['Finca en Siachoque'],
    });
    expect(rank).toBeGreaterThan(0);
  });

  it('returns 0 when nothing is similar', () => {
    expect(
      rankDocument('quinua', {
        a: ['Servicio de acarreo', 'transporte'],
        b: ['Viajes a Tunja'],
      }),
    ).toBe(0);
  });
});
