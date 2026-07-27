-- CreateEnum
CREATE TYPE "AnaliseStatus" AS ENUM ('pendente', 'aprovado', 'reprovado');

-- CreateTable
CREATE TABLE "analises" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "tipoContato" "ContatoTipo" NOT NULL,
    "stageSituacao" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "interesse" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL,
    "renda" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "temFgts" BOOLEAN NOT NULL DEFAULT false,
    "valorFgts" INTEGER,
    "temEntrada" BOOLEAN NOT NULL DEFAULT false,
    "valorEntrada" INTEGER,
    "temDependente" BOOLEAN NOT NULL DEFAULT false,
    "status" "AnaliseStatus" NOT NULL DEFAULT 'pendente',
    "parecer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analises_leadId_key" ON "analises"("leadId");

-- CreateIndex
CREATE INDEX "analises_autorId_idx" ON "analises"("autorId");

-- CreateIndex
CREATE INDEX "analises_status_idx" ON "analises"("status");

-- CreateIndex
CREATE INDEX "analises_createdAt_idx" ON "analises"("createdAt");

-- AddForeignKey
ALTER TABLE "analises" ADD CONSTRAINT "analises_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analises" ADD CONSTRAINT "analises_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
