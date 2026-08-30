-- Prisma wraps migrations in a transaction; new enum values cannot be used
-- until the transaction commits. This migration only adds the value.
ALTER TYPE "Role" ADD VALUE 'ADMIN';
