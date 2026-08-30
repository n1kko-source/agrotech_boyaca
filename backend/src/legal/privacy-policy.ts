import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PRIVACY_POLICY_VERSION = '2026-08-30';

export const PRIVACY_POLICY_TITLE =
  'Política de Tratamiento de Datos Personales';

export const PRIVACY_POLICY_ACCEPT_LABEL =
  'Acepto la Política de Tratamiento de Datos Personales';

export function loadPrivacyPolicyMarkdown(): string {
  return readFileSync(join(__dirname, 'privacy-policy.md'), 'utf8');
}
