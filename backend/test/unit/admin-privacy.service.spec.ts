import { AdminPrivacyService } from '../../src/admin/admin-privacy.service';
import { MemoryDeletionRequestStore } from '../../src/auth/privacy/deletion-request.store';

describe('AdminPrivacyService', () => {
  it('lists deletion requests without PII', async () => {
    const store = new MemoryDeletionRequestStore();
    await store.request('user-1');
    const service = new AdminPrivacyService(store);
    const page = await service.listDeletionRequests(20);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.userId).toBe('user-1');
    expect(page.nextCursor).toBeNull();
    expect(JSON.stringify(page)).not.toContain('email');
    expect(JSON.stringify(page)).not.toContain('phone');
  });

  it('is idempotent per user', async () => {
    const store = new MemoryDeletionRequestStore();
    await store.request('user-1');
    await store.request('user-1');
    expect(store.rows).toHaveLength(1);
  });
});
