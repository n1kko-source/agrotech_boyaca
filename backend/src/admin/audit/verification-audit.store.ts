import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  VerificationAudit,
  VerificationAuditRecord,
} from './verification-audit';

@Injectable()
export class PrismaVerificationAudit implements VerificationAudit {
  constructor(private readonly prisma: PrismaService) {}

  async append(record: VerificationAuditRecord): Promise<void> {
    const id = randomUUID();
    await this.prisma.db.$executeRaw`
      INSERT INTO verification_events (id, actor_id, target_user_id, verified, created_at)
      VALUES (
        ${id}::uuid,
        ${record.actorId}::uuid,
        ${record.targetUserId}::uuid,
        ${record.verified},
        NOW()
      )
    `;
  }
}

@Injectable()
export class MemoryVerificationAudit implements VerificationAudit {
  readonly events: VerificationAuditRecord[] = [];

  append(record: VerificationAuditRecord): Promise<void> {
    this.events.push(record);
    return Promise.resolve();
  }
}
