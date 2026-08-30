import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/auth/auth.service';
import { FirebaseEmailClient } from '../../src/auth/email/firebase-email.client';
import { OtpService } from '../../src/auth/otp/otp.service';
import { TokenService } from '../../src/auth/tokens/token.service';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { PRIVACY_POLICY_VERSION } from '../../src/legal/privacy-policy';
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
    findPrivacyConsent: jest.fn(),
    listPendingJuridica: jest.fn(),
    decryptJuridicaEmail: jest.fn(),
    setVerified: jest.fn(),
    ...overrides,
  };
}

function deletionsStub() {
  return {
    request: jest.fn().mockResolvedValue(undefined),
    list: jest.fn(),
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
      deletionsStub(),
    );

    await expect(
      auth.registerJuridica({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
        acceptPrivacyPolicy: true,
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
      deletionsStub(),
    );

    await expect(
      auth.registerJuridica({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
        acceptPrivacyPolicy: true,
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
      deletionsStub(),
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
      deletionsStub(),
    );

    await expect(auth.logout('refresh-token')).resolves.toEqual({
      revoked: true,
    });
    expect(revoke).toHaveBeenCalledWith('refresh-token');
  });
});

describe('AuthService privacy consent (Ley 1581)', () => {
  it('rejects NATURAL verify without consent before consuming the OTP', async () => {
    const verify = jest.fn();
    const findOrCreateNatural = jest.fn();
    const auth = new AuthService(
      { verify } as unknown as OtpService,
      {} as TokenService,
      {} as ConfigService,
      {} as FirebaseEmailClient,
      usersStub({ findOrCreateNatural }),
      deletionsStub(),
    );

    await expect(
      auth.verifyOtp({
        phone: '+573001112233',
        code: '123456',
        acceptPrivacyPolicy: false as unknown as true,
      }),
    ).rejects.toThrow('Privacy policy must be accepted');
    expect(verify).not.toHaveBeenCalled();
    expect(findOrCreateNatural).not.toHaveBeenCalled();
  });

  it('rejects JURIDICA register without consent before Firebase signUp', async () => {
    const signUp = jest.fn();
    const auth = new AuthService(
      {} as OtpService,
      {} as TokenService,
      {} as ConfigService,
      { signUp } as unknown as FirebaseEmailClient,
      usersStub(),
      deletionsStub(),
    );

    await expect(
      auth.registerJuridica({
        email: EMAIL,
        password: PASSWORD,
        nit: NIT,
        entityType: 'cooperativa',
        acceptPrivacyPolicy: false as unknown as true,
      }),
    ).rejects.toThrow('Privacy policy must be accepted');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('stamps the current policy version when creating JURIDICA', async () => {
    const createJuridica = jest.fn().mockResolvedValue({
      id: 'org-1',
      role: Role.JURIDICA,
      verified: false,
    });
    const firebase = {
      signUp: jest.fn().mockResolvedValue({
        localId: 'fb-1',
        idToken: 'id-tok',
      }),
      sendEmailVerification: jest.fn().mockResolvedValue(undefined),
    } as unknown as FirebaseEmailClient;
    const auth = new AuthService(
      {} as OtpService,
      {} as TokenService,
      {} as ConfigService,
      firebase,
      usersStub({ createJuridica }),
      deletionsStub(),
    );

    await auth.registerJuridica({
      email: EMAIL,
      password: PASSWORD,
      nit: NIT,
      entityType: 'cooperativa',
      acceptPrivacyPolicy: true,
    });
    expect(createJuridica).toHaveBeenCalledWith(
      expect.objectContaining({
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
      }),
    );
  });

  it('records a deletion request for the authenticated user', async () => {
    const deletions = deletionsStub();
    const auth = new AuthService(
      {} as OtpService,
      {} as TokenService,
      {} as ConfigService,
      {} as FirebaseEmailClient,
      usersStub(),
      deletions,
    );

    await expect(auth.requestDeletion('user-1')).resolves.toEqual({
      requested: true,
    });
    expect(deletions.request).toHaveBeenCalledWith('user-1');
  });
});
