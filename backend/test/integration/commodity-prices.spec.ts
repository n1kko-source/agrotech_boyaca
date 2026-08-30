import { PrismaClient } from '@prisma/client';
import { PrismaPricesStore } from '../../src/commodities/prices.store';
import { PrismaService } from '../../src/prisma/prisma.service';

const REPORTER_ID = '00000000-0000-4000-8000-000000000023';

function shouldRun(): boolean {
  const url = process.env.DATABASE_URL ?? '';
  return url.includes('ci:ci@127.0.0.1') || process.env.COMMODITY_PG === '1';
}

const describePg = shouldRun() ? describe : describe.skip;

describePg('Commodity prices on Postgres (AG-23)', () => {
  const prisma = new PrismaClient();
  const store = new PrismaPricesStore({
    db: prisma,
  } as unknown as PrismaService);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO users (
        id, role, email_enc, email_hash, nit_enc, nit_hash, entity_type,
        verified, created_at, updated_at
      )
      VALUES (
        ${REPORTER_ID}::uuid,
        'JURIDICA'::"Role",
        decode('00', 'hex'),
        ${'cmdty-email-hash'},
        decode('00', 'hex'),
        ${'cmdty-nit-hash'},
        'COOPERATIVA'::"EntityType",
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `;
    await prisma.$executeRaw`DELETE FROM commodity_prices WHERE reported_by = ${REPORTER_ID}::uuid`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM commodity_prices WHERE reported_by = ${REPORTER_ID}::uuid`;
    await prisma.$disconnect();
  });

  it('upserts the same product/region row', async () => {
    const first = await store.upsert({
      producto: 'papa criolla',
      region: 'siachoque',
      precio: 2800,
      unidad: 'kg',
      reportedBy: REPORTER_ID,
    });
    const second = await store.upsert({
      producto: 'papa criolla',
      region: 'siachoque',
      precio: 3100,
      unidad: 'kg',
      reportedBy: REPORTER_ID,
    });
    expect(second.id).toBe(first.id);
    expect(second.precio).toBe(3100);
    const found = await store.find('papa criolla', 'siachoque');
    expect(found?.precio).toBe(3100);
    expect(found?.moneda).toBe('COP');
  });
});
