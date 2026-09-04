import { randomUUID } from 'node:crypto';
import { PostsService } from '../../src/comunidad/posts.service';
import { MemoryPostsStore } from '../../src/comunidad/posts.store';
import { SUSCRIPCION_GRACE_MS } from '../../src/suscripciones/suscripciones.constants';
import { MemorySubscriptionsStore } from '../../src/suscripciones/subscriptions.store';

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
          updatedAt: now,
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

  const T0 = new Date('2026-09-01T12:00:00.000Z');
  const AUTHOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VIEWER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  async function listingService(periodEnd: Date | null) {
    const store = new MemoryPostsStore();
    const subscriptions = new MemorySubscriptionsStore();
    if (periodEnd) {
      await subscriptions.upsert({
        userId: AUTHOR,
        currentPeriodEnd: periodEnd,
        remindedExpiryAt: null,
        remindedGraceAt: null,
        remindedHiddenAt: null,
      });
    }
    return {
      store,
      service: new PostsService(store, subscriptions, () => T0),
    };
  }

  it('lets the owner read an unlisted post and hides it from others', async () => {
    const { store, service } = await listingService(null);
    const post = await store.create({
      authorId: AUTHOR,
      title: 'Papa criolla',
      description: 'Bultos de 50 kg',
      category: 'papa',
    });

    const mine = await service.getForViewer(AUTHOR, post.id);
    expect(mine).toMatchObject({
      id: post.id,
      authorId: AUTHOR,
      title: 'Papa criolla',
    });
    expect(JSON.stringify(mine)).not.toContain('en_gracia');

    await expect(service.getForViewer(VIEWER, post.id)).resolves.toBeNull();
    await expect(
      service.getForViewer(VIEWER, randomUUID()),
    ).resolves.toBeNull();
  });

  it('lists a post to others only while the author is activa or en_gracia', async () => {
    const listed = await listingService(T0);
    const post = await listed.store.create({
      authorId: AUTHOR,
      title: 'Cebolla cabezona',
      description: 'Roja',
      category: 'cebolla',
    });
    const view = await listed.service.getForViewer(VIEWER, post.id);
    expect(view?.id).toBe(post.id);

    const grace = await listingService(
      new Date(T0.getTime() - SUSCRIPCION_GRACE_MS + 60_000),
    );
    const gracePost = await grace.store.create({
      authorId: AUTHOR,
      title: 'Cebolla en gracia',
      description: 'Roja',
      category: 'cebolla',
    });
    await expect(
      grace.service.getForViewer(VIEWER, gracePost.id),
    ).resolves.toMatchObject({ id: gracePost.id });

    const expired = await listingService(
      new Date(T0.getTime() - SUSCRIPCION_GRACE_MS - 1),
    );
    const expiredPost = await expired.store.create({
      authorId: AUTHOR,
      title: 'Cebolla vencida',
      description: 'Roja',
      category: 'cebolla',
    });
    await expect(
      expired.service.getForViewer(VIEWER, expiredPost.id),
    ).resolves.toBeNull();
    await expect(
      expired.service.getForViewer(AUTHOR, expiredPost.id),
    ).resolves.toMatchObject({ id: expiredPost.id });
  });

  it('lists listed posts newest-first with a cursor and omits vencida', async () => {
    const subscriptions = new MemorySubscriptionsStore();
    await subscriptions.upsert({
      userId: AUTHOR,
      currentPeriodEnd: T0,
      remindedExpiryAt: null,
      remindedGraceAt: null,
      remindedHiddenAt: null,
    });
    const store = new MemoryPostsStore(subscriptions);
    const older = await store.create({
      authorId: AUTHOR,
      title: 'Habas',
      description: 'Tunja',
      category: 'haba',
    });
    older.createdAt = new Date('2026-08-01T12:00:00.000Z');
    const newer = await store.create({
      authorId: AUTHOR,
      title: 'Papa criolla',
      description: 'Siachoque',
      category: 'papa',
    });
    newer.createdAt = new Date('2026-09-01T12:00:00.000Z');
    await store.create({
      authorId: VIEWER,
      title: 'Sin suscripcion',
      description: 'Oculto',
      category: 'papa',
    });
    const service = new PostsService(store, subscriptions, () => T0);
    const first = await service.list(1);
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.title).toBe('Papa criolla');
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.list(1, first.nextCursor ?? undefined);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.title).toBe('Habas');
    expect(second.nextCursor).toBeNull();
  });

  it('deleteOwn removes only the author row', async () => {
    const store = new MemoryPostsStore();
    const service = new PostsService(
      store,
      new MemorySubscriptionsStore(),
      () => T0,
    );
    const mine = await store.create({
      authorId: AUTHOR,
      title: 'Papa criolla',
      description: 'Bultos',
      category: 'papa',
    });
    const other = await store.create({
      authorId: VIEWER,
      title: 'Maiz',
      description: 'Seco',
      category: 'maiz',
    });

    await expect(service.deleteOwn(VIEWER, mine.id)).resolves.toBe(false);
    await expect(store.findById(mine.id)).resolves.toMatchObject({
      id: mine.id,
    });
    await expect(service.deleteOwn(AUTHOR, randomUUID())).resolves.toBe(false);

    await expect(service.deleteOwn(AUTHOR, mine.id)).resolves.toBe(true);
    await expect(store.findById(mine.id)).resolves.toBeNull();
    await expect(store.findById(other.id)).resolves.toMatchObject({
      id: other.id,
    });
  });
});
