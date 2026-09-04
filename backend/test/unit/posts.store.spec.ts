import { PrismaPostsStore } from '../../src/comunidad/posts.store';
import { PrismaService } from '../../src/prisma/prisma.service';

function storeWithDelete(deleteFn: jest.Mock): PrismaPostsStore {
  return new PrismaPostsStore({
    db: { post: { delete: deleteFn } },
  } as unknown as PrismaService);
}

describe('PrismaPostsStore.delete', () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('returns true when the row is deleted', async () => {
    const del = jest.fn().mockResolvedValue({ id });
    const store = storeWithDelete(del);
    await expect(store.delete(id)).resolves.toBe(true);
    expect(del).toHaveBeenCalledWith({ where: { id } });
  });

  it('returns false only when Prisma reports the row missing (P2025)', async () => {
    const del = jest.fn().mockRejectedValue({ code: 'P2025' });
    const store = storeWithDelete(del);
    await expect(store.delete(id)).resolves.toBe(false);
  });

  it('rethrows other Prisma/Postgres failures', async () => {
    const boom = Object.assign(new Error('db down'), { code: 'P1001' });
    const del = jest.fn().mockRejectedValue(boom);
    const store = storeWithDelete(del);
    await expect(store.delete(id)).rejects.toBe(boom);
  });
});
