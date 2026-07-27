-- AlterTable
ALTER TABLE "users" ADD COLUMN "whatsapp" TEXT;

-- CreateEnum
CREATE TYPE "NotificacaoTipo" AS ENUM ('analise_resultado');

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "NotificacaoTipo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "leadId" TEXT,
    "analiseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacoes_userId_lida_idx" ON "notificacoes"("userId", "lida");

-- CreateIndex
CREATE INDEX "notificacoes_createdAt_idx" ON "notificacoes"("createdAt");

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
