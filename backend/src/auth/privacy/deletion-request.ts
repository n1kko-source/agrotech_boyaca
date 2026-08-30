import type { CursorPayload } from '../../shared/pagination/cursor';

export const DELETION_REQUESTS = Symbol('DELETION_REQUESTS');

export type DeletionRequestRow = {
  id: string;
  t: number;
  userId: string;
  createdAt: string;
};

export interface DeletionRequestStore {
  request(userId: string): Promise<void>;
  list(limit: number, cursor?: CursorPayload): Promise<DeletionRequestRow[]>;
}
