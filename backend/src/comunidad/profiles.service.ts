import { Inject, Injectable } from '@nestjs/common';
import { PROFILES_STORE } from './profiles.store';
import type {
  ProfileRecord,
  ProfilesStore,
  RankedProfile,
} from './profiles.store';

export type ProfileView = {
  id: string;
  userId: string;
  displayName: string;
  municipality: string;
  bio: string;
  category: string;
  createdAt: string;
};

export type RankedProfileView = ProfileView & { rank: number };

export type SearchProfilesResult = {
  items: RankedProfileView[];
};

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(PROFILES_STORE) private readonly profiles: ProfilesStore,
  ) {}

  findByUserId(userId: string): Promise<ProfileRecord | null> {
    return this.profiles.findByUserId(userId);
  }

  async upsert(
    userId: string,
    input: {
      displayName: string;
      municipality: string;
      category: string;
      bio?: string;
      id?: string;
    },
  ): Promise<ProfileView> {
    const row = await this.profiles.upsert({
      id: input.id,
      userId,
      displayName: input.displayName,
      municipality: input.municipality,
      category: input.category,
      bio: input.bio ?? '',
    });
    return toProfileView(row);
  }

  async search(q: string, limit: number): Promise<SearchProfilesResult> {
    const rows = await this.profiles.search(q, limit);
    return { items: rows.map(toRankedProfileView) };
  }
}

function toProfileView(row: ProfileRecord): ProfileView {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    municipality: row.municipality,
    bio: row.bio,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRankedProfileView(row: RankedProfile): RankedProfileView {
  return { ...toProfileView(row), rank: row.rank };
}
