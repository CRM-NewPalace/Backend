-- CreateTable
CREATE TABLE "documentacoes" (
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
    "temFgts" BOOLEAN NOT NULL,
    "valorFgts" INTEGER,
    "temEntrada" BOOLEAN NOT NULL,
    "valorEntrada" INTEGER,
    "temDependente" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentacoes_leadId_idx" ON "documentacoes"("leadId");

-- CreateIndex
CREATE INDEX "documentacoes_autorId_idx" ON "documentacoes"("autorId");

-- CreateIndex
CREATE INDEX "documentacoes_createdAt_idx" ON "documentacoes"("createdAt");

-- AddForeignKey
ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
