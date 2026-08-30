export const VERIFICATION_AUDIT = Symbol('VERIFICATION_AUDIT');

export type VerificationAuditRecord = {
  actorId: string;
  targetUserId: string;
  verified: boolean;
};

export interface VerificationAudit {
  append(record: VerificationAuditRecord): Promise<void>;
}
