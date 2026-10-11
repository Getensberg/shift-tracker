-- CreateEnum
CREATE TYPE "OutOfWindowRule" AS ENUM ('REVIEW', 'REJECT');

-- CreateEnum
CREATE TYPE "MultiEmployeeRule" AS ENUM ('REVIEW', 'ACCEPT_ALL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVIEW', 'DUPLICATE', 'ERROR', 'IGNORED');

-- CreateEnum
CREATE TYPE "MarkSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'OK', 'ERROR', 'DISABLED');

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "username" TEXT,
    "objectName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "shiftStart" TEXT NOT NULL DEFAULT '08:00',
    "windowBeforeMin" INTEGER NOT NULL DEFAULT 60,
    "windowAfterMin" INTEGER NOT NULL DEFAULT 90,
    "outOfWindow" "OutOfWindowRule" NOT NULL DEFAULT 'REVIEW',
    "multiEmployee" "MultiEmployeeRule" NOT NULL DEFAULT 'REVIEW',
    "autoAccept" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "aliases" TEXT[],
    "personnelNumber" TEXT,
    "tgUserId" BIGINT,
    "tgUsername" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupEmployee" (
    "groupId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,

    CONSTRAINT "GroupEmployee_pkey" PRIMARY KEY ("groupId","employeeId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "tgMessageId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "fromUserId" BIGINT,
    "fromName" TEXT,
    "fromUsername" TEXT,
    "caption" TEXT,
    "photoFileId" TEXT,
    "mediaGroupId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "link" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "suggestedIds" INTEGER[],
    "suggestedDate" DATE,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftMark" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "shiftDate" DATE NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "objectName" TEXT,
    "source" "MarkSource" NOT NULL,
    "messageId" INTEGER,
    "lateMinutes" INTEGER,
    "comment" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sheetStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "sheetError" TEXT,

    CONSTRAINT "ShiftMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "employeeId" INTEGER,
    "shiftDate" DATE,
    "messageId" INTEGER,
    "details" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_chatId_key" ON "Group"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_personnelNumber_key" ON "Employee"("personnelNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tgUserId_key" ON "Employee"("tgUserId");

-- CreateIndex
CREATE INDEX "Message_status_createdAt_idx" ON "Message"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Message_sentAt_idx" ON "Message"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_chatId_tgMessageId_key" ON "Message"("chatId", "tgMessageId");

-- CreateIndex
CREATE INDEX "ShiftMark_shiftDate_idx" ON "ShiftMark"("shiftDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftMark_employeeId_shiftDate_key" ON "ShiftMark"("employeeId", "shiftDate");

-- CreateIndex
CREATE INDEX "AuditLog_employeeId_shiftDate_idx" ON "AuditLog"("employeeId", "shiftDate");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "GroupEmployee" ADD CONSTRAINT "GroupEmployee_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEmployee" ADD CONSTRAINT "GroupEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftMark" ADD CONSTRAINT "ShiftMark_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftMark" ADD CONSTRAINT "ShiftMark_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
