export class EmailExistsError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailExistsError';
  }
}

export class EmailAuthInvalidError extends Error {
  constructor() {
    super('Invalid email credentials');
    this.name = 'EmailAuthInvalidError';
  }
}

export class EmailAuthProviderError extends Error {
  constructor(readonly kind: 'signUp' | 'verifyEmail' | 'signIn' | 'delete') {
    super('Email auth provider error');
    this.name = 'EmailAuthProviderError';
  }
}
