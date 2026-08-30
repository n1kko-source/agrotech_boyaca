import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { USERS_REPOSITORY } from '../auth/users/users.repository';
import type {
  PendingJuridicaRow,
  UsersRepository,
} from '../auth/users/users.repository';
import { Role } from '../shared/auth/role.enum';
import {
  decodeCursor,
  paginate,
  type Paginated,
} from '../shared/pagination/cursor';
import { VERIFICATION_AUDIT } from './audit/verification-audit';
import type { VerificationAudit } from './audit/verification-audit';
import { ACCOUNT_MAILER } from './mailer/account-mailer';
import type { AccountMailer } from './mailer/account-mailer';

export type PendingJuridicaView = {
  id: string;
  entityType: PendingJuridicaRow['entityType'];
  createdAt: string;
  nitMasked: string;
};

export type VerifyJuridicaResult = {
  verified: boolean;
};

@Injectable()
export class AdminJuridicaService {
  private readonly logger = new Logger(AdminJuridicaService.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(VERIFICATION_AUDIT) private readonly audit: VerificationAudit,
    @Inject(ACCOUNT_MAILER) private readonly mailer: AccountMailer,
  ) {}

  async listPending(
    limit: number,
    cursor?: string,
  ): Promise<Paginated<PendingJuridicaView>> {
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.users.listPendingJuridica(limit, decoded);
    const page = paginate(rows, limit);
    return {
      items: page.items.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        createdAt: row.createdAt,
        nitMasked: row.nitMasked,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async setVerified(
    actorId: string,
    targetId: string,
    verified: boolean,
  ): Promise<VerifyJuridicaResult> {
    const target = await this.users.findById(targetId);
    if (!target || target.role !== Role.JURIDICA) {
      throw new NotFoundException('Not found');
    }
    if (target.verified === verified) {
      return { verified };
    }
    const updated = await this.users.setVerified(targetId, verified);
    if (!updated) {
      throw new NotFoundException('Not found');
    }
    await this.audit.append({
      actorId,
      targetUserId: targetId,
      verified,
    });
    this.logger.log(
      `juridica verification actor=${actorId} target=${targetId} verified=${verified}`,
    );
    if (verified) {
      await this.notifyVerified(targetId);
    }
    return { verified };
  }

  private async notifyVerified(targetId: string): Promise<void> {
    const email = await this.users.decryptJuridicaEmail(targetId);
    if (!email) {
      this.logger.error(`Verification email skipped user=${targetId}`);
      return;
    }
    try {
      await this.mailer.sendJuridicaVerified({ userId: targetId, email });
    } catch {
      this.logger.error(`Verification email failed user=${targetId}`);
    }
  }
}
