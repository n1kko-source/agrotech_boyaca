import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../shared/decorators/public.decorator';
import {
  loadPrivacyPolicyMarkdown,
  PRIVACY_POLICY_ACCEPT_LABEL,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_VERSION,
} from './privacy-policy';

export type PrivacyPolicyBody = {
  version: string;
  title: string;
  acceptLabel: string;
  markdown: string;
};

@Controller('legal')
@Public()
export class LegalController {
  @Get('privacy-policy')
  getPrivacyPolicy(): PrivacyPolicyBody {
    return {
      version: PRIVACY_POLICY_VERSION,
      title: PRIVACY_POLICY_TITLE,
      acceptLabel: PRIVACY_POLICY_ACCEPT_LABEL,
      markdown: loadPrivacyPolicyMarkdown(),
    };
  }

  @Get('privacy-policy.md')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  getPrivacyPolicyMarkdown(): string {
    return loadPrivacyPolicyMarkdown();
  }
}
