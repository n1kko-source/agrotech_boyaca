import { randomUUID } from 'node:crypto';
import { PostsService } from '../../src/comunidad/posts.service';
import { MemoryPostsStore } from '../../src/comunidad/posts.store';

const CROPS = [
  'papa',
  'cebolla',
  'zanahoria',
  'maiz',
  'arveja',
  'leche',
  'fresa',
  'uchuva',
] as const;

describe('PostsService', () => {
  it('ranks title and category above a weak description match', async () => {
    const store = new MemoryPostsStore();
    const authorId = randomUUID();
    await store.create({
      authorId,
      title: 'Venta de papa criolla',
      description: 'Cosecha de esta semana',
      category: 'papa',
    });
    await store.create({
      authorId,
      title: 'Acarreo a Tunja',
      description: 'A veces llevo papa si hay cupo',
      category: 'transporte',
    });
    const service = new PostsService(store);
    const page = await service.search('papa criolla', 20);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.title).toBe('Venta de papa criolla');
    expect(page.items[0]?.rank).toBeGreaterThan(page.items[1]?.rank ?? 0);
  });

  it('matches unaccent and a basic typo', async () => {
    const store = new MemoryPostsStore();
    await store.create({
      authorId: randomUUID(),
      title: 'Cebolla cabezona roja',
      description: 'Lotes de 50 kg',
      category: 'cebolla',
    });
    const service = new PostsService(store);
    const accent = await service.search('cebólla', 10);
    expect(accent.items).toHaveLength(1);
    const typo = await service.search('ceblla', 10);
    expect(typo.items).toHaveLength(1);
  });

  it('returns ranked hits from a 5000-post corpus', async () => {
    const store = new MemoryPostsStore();
    const authorId = randomUUID();
    const now = new Date();
    store.insertMany(
      Array.from({ length: 5000 }, (_, index) => {
        const crop = CROPS[index % CROPS.length] ?? 'papa';
        return {
          id: randomUUID(),
          authorId,
          title: `Venta de ${crop} lote ${index}`,
          description: `Oferta de ${crop} fresca en Boyacá. Calidad de finca.`,
          category: crop,
          createdAt: now,
        };
      }),
    );
    const service = new PostsService(store);
    const page = await service.search('papa pastusa', 20);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.category === 'papa')).toBe(true);
    expect(page.items[0]?.rank ?? 0).toBeGreaterThanOrEqual(
      page.items[page.items.length - 1]?.rank ?? 0,
    );
  });
});
