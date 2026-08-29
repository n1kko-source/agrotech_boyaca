import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailAuthInvalidError,
  EmailAuthProviderError,
  EmailExistsError,
} from './email.errors';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

type IdentityJson = Record<string, unknown>;

export type EmailSignUpResult = {
  localId: string;
  idToken: string;
};

export type EmailSignInResult = {
  localId: string;
  idToken: string;
  emailVerified: boolean;
};

type LocalAccount = {
  uid: string;
  passwordHash: string;
  emailVerified: boolean;
};

@Injectable()
export class FirebaseEmailClient {
  private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis);
  private readonly localAccounts = new Map<string, LocalAccount>();

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  get mode(): 'local' | 'firebase' {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      return 'firebase';
    }
    return this.configured ? 'firebase' : 'local';
  }

  async signUp(email: string, password: string): Promise<EmailSignUpResult> {
    if (this.mode === 'local') {
      return this.localSignUp(email, password);
    }
    const json = await this.post(
      'accounts:signUp',
      { email, password, returnSecureToken: true },
      'signUp',
    );
    const localId = stringField(json, 'localId');
    const idToken = stringField(json, 'idToken');
    if (!localId || !idToken) {
      throw new EmailAuthProviderError('signUp');
    }
    return { localId, idToken };
  }

  async sendEmailVerification(idToken: string): Promise<void> {
    if (this.mode === 'local') {
      this.localVerifyEmail(idToken);
      return;
    }
    await this.post(
      'accounts:sendOobCode',
      { requestType: 'VERIFY_EMAIL', idToken },
      'verifyEmail',
    );
  }

  async signIn(email: string, password: string): Promise<EmailSignInResult> {
    if (this.mode === 'local') {
      return this.localSignIn(email, password);
    }
    const json = await this.post(
      'accounts:signInWithPassword',
      { email, password, returnSecureToken: true },
      'signIn',
    );
    const localId = stringField(json, 'localId');
    const idToken = stringField(json, 'idToken');
    if (!localId || !idToken) {
      throw new EmailAuthProviderError('signIn');
    }
    return {
      localId,
      idToken,
      emailVerified: boolField(json, 'emailVerified'),
    };
  }

  async deleteAccount(idToken: string): Promise<void> {
    if (this.mode === 'local') {
      this.localDelete(idToken);
      return;
    }
    await this.post('accounts:delete', { idToken }, 'delete');
  }

  private localSignUp(email: string, password: string): EmailSignUpResult {
    if (this.localAccounts.has(email)) {
      throw new EmailExistsError();
    }
    const uid = randomUUID();
    this.localAccounts.set(email, {
      uid,
      passwordHash: hashPassword(password),
      emailVerified: false,
    });
    return { localId: uid, idToken: `local:${email}` };
  }

  private localVerifyEmail(idToken: string): void {
    const email = idToken.startsWith('local:') ? idToken.slice(6) : '';
    const account = this.localAccounts.get(email);
    if (!account) {
      throw new EmailAuthProviderError('verifyEmail');
    }
    account.emailVerified = true;
  }

  private localSignIn(email: string, password: string): EmailSignInResult {
    const account = this.localAccounts.get(email);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      throw new EmailAuthInvalidError();
    }
    return {
      localId: account.uid,
      idToken: `local:${email}`,
      emailVerified: account.emailVerified,
    };
  }

  private localDelete(idToken: string): void {
    const email = idToken.startsWith('local:') ? idToken.slice(6) : '';
    if (!this.localAccounts.delete(email)) {
      throw new EmailAuthProviderError('delete');
    }
  }

  private get apiKey(): string {
    return this.config.get<string>('FIREBASE_WEB_API_KEY')?.trim() ?? '';
  }

  private async post(
    path: string,
    body: Record<string, string | boolean>,
    kind: 'signUp' | 'verifyEmail' | 'signIn' | 'delete',
  ): Promise<IdentityJson> {
    if (!this.apiKey) {
      throw new EmailAuthProviderError(kind);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${IDENTITY_TOOLKIT}/${path}?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Firebase-Locale': 'es',
          },
          body: JSON.stringify(body),
        },
      );
    } catch {
      throw new EmailAuthProviderError(kind);
    }
    let json: IdentityJson = {};
    try {
      json = (await res.json()) as IdentityJson;
    } catch {
      throw new EmailAuthProviderError(kind);
    }
    if (!res.ok) {
      throw mapFirebaseError(json, kind);
    }
    return json;
  }
}

function mapFirebaseError(
  json: IdentityJson,
  kind: 'signUp' | 'verifyEmail' | 'signIn' | 'delete',
): Error {
  const message = firebaseMessage(json);
  if (message === 'EMAIL_EXISTS') {
    return new EmailExistsError();
  }
  if (
    message === 'EMAIL_NOT_FOUND' ||
    message === 'INVALID_PASSWORD' ||
    message === 'INVALID_LOGIN_CREDENTIALS' ||
    message === 'INVALID_EMAIL'
  ) {
    return new EmailAuthInvalidError();
  }
  return new EmailAuthProviderError(kind);
}

function firebaseMessage(json: IdentityJson): string {
  const error = json.error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message.split(' : ')[0] ?? message;
    }
  }
  return '';
}

function stringField(json: IdentityJson, key: string): string | null {
  const value = json[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function boolField(json: IdentityJson, key: string): boolean {
  const value = json[key];
  return value === true || value === 'true';
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) {
    return false;
  }
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
