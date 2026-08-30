import { LegalController } from '../../src/legal/legal.controller';
import {
  loadPrivacyPolicyMarkdown,
  PRIVACY_POLICY_ACCEPT_LABEL,
  PRIVACY_POLICY_VERSION,
} from '../../src/legal/privacy-policy';

describe('privacy policy document', () => {
  it('loads markdown with Ley 1581 coverage and a stable version', () => {
    const markdown = loadPrivacyPolicyMarkdown();
    expect(PRIVACY_POLICY_VERSION).toBe('2026-08-30');
    expect(markdown).toContain('Ley 1581');
    expect(markdown).toContain(PRIVACY_POLICY_VERSION);
    expect(PRIVACY_POLICY_ACCEPT_LABEL).toBe(
      'Acepto la Política de Tratamiento de Datos Personales',
    );
  });

  it('returns version, checkbox label and markdown from the controller', () => {
    const body = new LegalController().getPrivacyPolicy();
    expect(body.version).toBe(PRIVACY_POLICY_VERSION);
    expect(body.acceptLabel).toBe(PRIVACY_POLICY_ACCEPT_LABEL);
    expect(body.markdown).toContain('habeas data');
  });
});
