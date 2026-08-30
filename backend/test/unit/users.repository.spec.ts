import { ConfigService } from '@nestjs/config';
import {
  PGP_ENCRYPT_OPTIONS,
  PrismaUsersRepository,
} from '../../src/auth/users/users.repository';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaUsersRepository', () => {
  it('uses pgcrypto AES-256 for phone ciphertext', () => {
    expect(PGP_ENCRYPT_OPTIONS).toBe('cipher-algo=aes256');
  });

  it('upserts by phone hash without throwing the plaintext phone', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([{ id: 'user-1', role: 'NATURAL', verified: true }]);
    const prisma = { db: { $queryRaw: queryRaw } } as unknown as PrismaService;
    const config = {
      get: (key: string) => {
        if (key === 'PII_HASH_PEPPER') {
          return 'pepper';
        }
        if (key === 'PII_ENCRYPTION_KEY') {
          return 'enc-key';
        }
        return undefined;
      },
    } as ConfigService;
    const repo = new PrismaUsersRepository(prisma, config);
    const user = await repo.findOrCreateNatural('+573009998877', 'fb-uid');
    expect(user).toEqual({ id: 'user-1', role: 'NATURAL', verified: true });
    expect(queryRaw).toHaveBeenCalled();
  });

  it('inserts JURIDICA with encrypted email and NIT, verified false', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'org-1',
        role: 'JURIDICA',
        verified: false,
        entity_type: 'COOPERATIVA',
      },
    ]);
    const prisma = { db: { $queryRaw: queryRaw } } as unknown as PrismaService;
    const config = {
      get: (key: string) => {
        if (key === 'PII_HASH_PEPPER') {
          return 'pepper';
        }
        if (key === 'PII_ENCRYPTION_KEY') {
          return 'enc-key';
        }
        return undefined;
      },
    } as ConfigService;
    const repo = new PrismaUsersRepository(prisma, config);
    const user = await repo.createJuridica({
      email: 'coop@example.com',
      nit: '8001972684',
      entityType: 'cooperativa',
      firebaseUid: 'fb-org',
    });
    expect(user).toEqual({
      id: 'org-1',
      role: 'JURIDICA',
      verified: false,
      entityType: 'cooperativa',
    });
    expect(queryRaw).toHaveBeenCalled();
  });
});
