import { NotFoundException } from '@nestjs/common';
import { AdminJuridicaService } from '../../src/admin/admin-juridica.service';
import { MemoryVerificationAudit } from '../../src/admin/audit/verification-audit.store';
import type { UsersRepository } from '../../src/auth/users/users.repository';
import { Role } from '../../src/shared/auth/role.enum';

describe('AdminJuridicaService', () => {
  const targetId = '11111111-1111-1111-1111-111111111111';
  const actorId = '22222222-2222-2222-2222-222222222222';

  it('sets verified, writes audit without PII, and notifies', async () => {
    const sendJuridicaVerified = jest.fn().mockResolvedValue(undefined);
    const audit = new MemoryVerificationAudit();
    const users = {
      findById: jest.fn().mockResolvedValue({
        id: targetId,
        role: Role.JURIDICA,
        verified: false,
      }),
      setVerified: jest.fn().mockResolvedValue(true),
      decryptJuridicaEmail: jest.fn().mockResolvedValue('coop@example.com'),
      listPendingJuridica: jest.fn(),
    } as unknown as UsersRepository;
    const service = new AdminJuridicaService(users, audit, {
      sendJuridicaVerified,
    });

    await expect(service.setVerified(actorId, targetId, true)).resolves.toEqual(
      { verified: true },
    );
    expect(audit.events).toEqual([
      { actorId, targetUserId: targetId, verified: true },
    ]);
    expect(JSON.stringify(audit.events)).not.toContain('coop@example.com');
    expect(sendJuridicaVerified).toHaveBeenCalledWith({
      userId: targetId,
      email: 'coop@example.com',
    });
  });

  it('returns 404 for non-juridica targets', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({
        id: targetId,
        role: Role.NATURAL,
        verified: true,
      }),
    } as unknown as UsersRepository;
    const service = new AdminJuridicaService(
      users,
      new MemoryVerificationAudit(),
      { sendJuridicaVerified: jest.fn() },
    );
    await expect(
      service.setVerified(actorId, targetId, true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
