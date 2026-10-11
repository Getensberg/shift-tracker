-- CreateEnum
CREATE TYPE "SenderMismatchRule" AS ENUM ('ACCEPT', 'REVIEW');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "senderMismatch" "SenderMismatchRule" NOT NULL DEFAULT 'ACCEPT';
