import {
  commodityCacheKey,
  normalizeCommodityLabel,
} from '../../src/commodities/commodity-label';

describe('commodity labels', () => {
  it('folds case and extra spaces for product/region identity', () => {
    expect(normalizeCommodityLabel('  Papa  Criolla ')).toBe('papa criolla');
    expect(commodityCacheKey('Papa criolla', 'Siachoque')).toBe(
      'agrotech:cmdty:papa_criolla:siachoque',
    );
  });
});
