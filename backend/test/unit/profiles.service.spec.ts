import { randomUUID } from 'node:crypto';
import { ProfilesService } from '../../src/comunidad/profiles.service';
import { MemoryProfilesStore } from '../../src/comunidad/profiles.store';

describe('ProfilesService', () => {
  it('upserts a public card and searches by municipality typo', async () => {
    const store = new MemoryProfilesStore();
    const service = new ProfilesService(store);
    const userId = randomUUID();
    const saved = await service.upsert(userId, {
      displayName: 'Finca El Rosal',
      municipality: 'Siachoque',
      category: 'papa',
      bio: 'Papa pastusa y criolla',
    });
    expect(saved.userId).toBe(userId);
    expect(JSON.stringify(saved)).not.toContain('phone');
    expect(JSON.stringify(saved)).not.toContain('email');

    const again = await service.upsert(userId, {
      displayName: 'Finca El Rosal',
      municipality: 'Siachoque',
      category: 'papa',
      bio: 'Actualizado',
    });
    expect(again.id).toBe(saved.id);
    expect(again.bio).toBe('Actualizado');

    const page = await service.search('Siachoqe', 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.displayName).toBe('Finca El Rosal');
  });

  it('does not leak a miss into results', async () => {
    const store = new MemoryProfilesStore();
    await store.upsert({
      userId: randomUUID(),
      displayName: 'Lácteos Tunja',
      municipality: 'Tunja',
      category: 'leche',
      bio: 'Queso y cuajada',
    });
    const service = new ProfilesService(store);
    const page = await service.search('uchuva', 10);
    expect(page.items).toHaveLength(0);
  });
});
