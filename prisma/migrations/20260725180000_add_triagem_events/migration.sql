-- CreateEnum
CREATE TYPE "TriagemOrigem" AS ENUM ('funil', 'manual');

-- CreateTable
CREATE TABLE "triagem_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "stageAnterior" TEXT,
    "stageNovo" TEXT,
    "origem" "TriagemOrigem" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triagem_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "triagem_events_leadId_idx" ON "triagem_events"("leadId");

-- CreateIndex
CREATE INDEX "triagem_events_autorId_idx" ON "triagem_events"("autorId");

-- CreateIndex
CREATE INDEX "triagem_events_createdAt_idx" ON "triagem_events"("createdAt");

-- AddForeignKey
ALTER TABLE "triagem_events" ADD CONSTRAINT "triagem_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triagem_events" ADD CONSTRAINT "triagem_events_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
