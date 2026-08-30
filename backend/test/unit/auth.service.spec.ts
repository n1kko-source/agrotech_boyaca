import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/auth/auth.service';
import { FirebaseEmailClient } from '../../src/auth/email/firebase-email.client';
import { OtpService } from '../../src/auth/otp/otp.service';
import { TokenService } from '../../src/auth/tokens/token.service';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { Role } from '../../src/shared/auth/role.enum';

const EMAIL = 'coop@example.com';
const NIT = '8001972684';
const PASSWORD = 'ClaveSegura1';

function usersStub(overrides: Partial<UsersRepository> = {}): UsersRepository {
  return {
    findOrCreateNatural: jest.fn(),
    createJuridica: jest.fn(),
    createAdmin: jest.fn(),
    findJuridicaByEmail: jest.fn().mockResolvedValue(null),
    findJuridicaByNit: jest.fn().mockResolvedValue(null),
    findAdminByEmail: jest.fn(),
    findById: jest.fn(),
    listPendingJuridica: jest.fn(),
    decryptJuridicaEmail: jest.fn(),
    setVerified: jest.fn(),
    ...overrides,
  };
}

describe('AuthService JURIDICA compensation', () => {
  it('deletes the Firebase user if persist fails after signUp', async () => {
    const deleteAccount = jest.fn().mockResolvedValue(undefined);
    const sendEmailVerification = jest.fn();
    const firebase = {
      signUp: jest.fn().mockResolvedValue({
        localId: 'fb-1',
        idToken: 'id-tok',
      }),
      sendEmailVerification,
      deleteAccount,
    } as unknown as FirebaseEmailClient;
    const users = usersStub({
      createJuridica: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const auth = new AuthService(
      {} as OtpService,
      {} as TokenService,
      {} as ConfigService,
      firebase,
      users,
    );

    await expect(
      auth.registerJuridica({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
      }),
    ).rejects.toThrow('db down');
    expect(deleteAccount).toHaveBeenCalledWith('id-tok');
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('compensates on unique conflict after signUp', async () => {
    const deleteAccount = jest.fn().mockResolvedValue(undefined);
    const firebase = {
      signUp: jest.fn().mockResolvedValue({
        localId: 'fb-1',
        idToken: 'id-tok',
      }),
      sendEmailVerification: jest.fn(),
      deleteAccount,
    } as unknown as FirebaseEmailClient;
    const users = usersStub({
      createJuridica: jest
        .fn()
        .mockRejectedValue(new ConflictException('Account already exists')),
    });
    const auth = new AuthService(
      {} as OtpService,
      {} as TokenService,
      {} as ConfigService,
      firebase,
      users,
    );

    await expect(
      auth.registerJuridica({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(deleteAccount).toHaveBeenCalledWith('id-tok');
  });
});

describe('AuthService refresh and logout', () => {
  const tokensStub = (overrides: Partial<TokenService> = {}): TokenService =>
    ({
      issue: jest.fn(),
      takeRefresh: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    }) as unknown as TokenService;

  it('reissues refresh with entityType from the JURIDICA profile', async () => {
    const issue = jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r2',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
    const tokens = tokensStub({
      issue,
      takeRefresh: jest
        .fn()
        .mockResolvedValue({ sub: 'org-1', role: Role.JURIDICA }),
    });
    const users = usersStub({
      findById: jest.fn().mockResolvedValue({
        id: 'org-1',
        role: Role.JURIDICA,
        verified: true,
        entityType: 'empresa',
      }),
    });
    const auth = new AuthService(
      {} as OtpService,
      tokens,
      {} as ConfigService,
      {} as FirebaseEmailClient,
      users,
    );

    await auth.refresh('refresh-token');
    expect(issue).toHaveBeenCalledWith('org-1', Role.JURIDICA, 'empresa');
  });

  it('revokes the refresh token on logout', async () => {
    const revoke = jest.fn().mockResolvedValue(undefined);
    const tokens = tokensStub({ revoke });
    const auth = new AuthService(
      {} as OtpService,
      tokens,
      {} as ConfigService,
      {} as FirebaseEmailClient,
      usersStub(),
    );

    await expect(auth.logout('refresh-token')).resolves.toEqual({
      revoked: true,
    });
    expect(revoke).toHaveBeenCalledWith('refresh-token');
  });
});
