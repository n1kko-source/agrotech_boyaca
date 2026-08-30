import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPostsStore } from '../../src/comunidad/posts.store';
import { PrismaService } from '../../src/prisma/prisma.service';

const BENCH_COUNT = 5_000;
const SLA_MS = 200;
const AUTHOR_ID = '00000000-0000-4000-8000-000000000021';

function shouldRunFtsBench(): boolean {
  const url = process.env.DATABASE_URL ?? '';
  return process.env.FTS_BENCH === '1' || url.includes('ci:ci@127.0.0.1');
}

/**
 * Hits real Postgres FTS (GIN tsvector + pg_trgm). Off unless CI Postgres
 * (`ci:ci@127.0.0.1`) or `FTS_BENCH=1` so a local `.env` never gets 5k rows.
 */
const describeFts = shouldRunFtsBench() ? describe : describe.skip;

describeFts('Posts FTS on Postgres (AG-21)', () => {
  const prisma = new PrismaClient();
  const store = new PrismaPostsStore({
    db: prisma,
  } as unknown as PrismaService);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO users (
        id, role, phone_enc, phone_hash, verified, created_at, updated_at
      )
      VALUES (
        ${AUTHOR_ID}::uuid,
        'NATURAL'::"Role",
        decode('00', 'hex'),
        ${'fts-bench-phone-hash'},
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`DELETE FROM posts WHERE author_id = ${AUTHOR_ID}::uuid`;
    await prisma.$executeRaw`
      INSERT INTO posts (id, author_id, title, description, category, created_at, updated_at)
      SELECT gen_random_uuid(),
        ${AUTHOR_ID}::uuid,
        'Venta de ' || crop || ' lote ' || gs::text,
        'Oferta de ' || crop || ' fresca en Boyacá. Calidad de finca, entrega en plaza.',
        crop,
        NOW(),
        NOW()
      FROM generate_series(1, ${BENCH_COUNT}::int) AS gs
      CROSS JOIN LATERAL (
        SELECT (ARRAY[
          'papa','cebolla','zanahoria','maiz','arveja','leche','fresa','uchuva'
        ])[1 + ((gs - 1) % 8)] AS crop
      ) c
    `;
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM posts WHERE author_id = ${AUTHOR_ID}::uuid`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${AUTHOR_ID}::uuid`;
    await prisma.$disconnect();
  });

  it('ranks a title hit first', async () => {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO posts (id, author_id, title, description, category, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${AUTHOR_ID}::uuid,
        'Venta de papa criolla certificada',
        'Cosecha de Siachoque',
        'papa',
        NOW(),
        NOW()
      )
    `;
    const hits = await store.search('papa criolla', 10);
    expect(hits[0]?.id).toBe(id);
  });

  it('matches unaccent and a basic typo via pg_trgm', async () => {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO posts (id, author_id, title, description, category, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${AUTHOR_ID}::uuid,
        'Cebolla cabezona roja',
        'Lotes de 50 kg',
        'cebolla',
        NOW(),
        NOW()
      )
    `;
    const accent = await store.search('cebólla', 10);
    expect(accent.some((hit) => hit.id === id)).toBe(true);
    const typo = await store.search('ceblla', 10);
    expect(typo.some((hit) => hit.id === id)).toBe(true);
  });

  it(`answers under ${SLA_MS}ms on ${BENCH_COUNT} posts`, async () => {
    const started = Date.now();
    const hits = await store.search('papa', 20);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(SLA_MS);
    expect(hits.length).toBeGreaterThan(0);
    const last = hits[hits.length - 1];
    expect(last).toBeDefined();
    expect(
      hits.every((hit) => last !== undefined && hit.rank >= last.rank),
    ).toBe(true);
  });
});
