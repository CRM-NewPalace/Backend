-- CreateEnum
CREATE TYPE "PlatformContratoTipo" AS ENUM ('assinatura', 'financeiro');

-- CreateEnum
CREATE TYPE "PlatformContratoStatus" AS ENUM ('proposta', 'ativo', 'atrasado', 'suspenso', 'cancelado', 'encerrado');

-- CreateTable
CREATE TABLE "platform_contratos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "PlatformContratoTipo" NOT NULL,
    "plano" "TenantPlano",
    "valor" DOUBLE PRECISION NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "vencimento" TIMESTAMP(3),
    "status" "PlatformContratoStatus" NOT NULL DEFAULT 'proposta',
    "observacao" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_contrato_parcelas" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "FinanceiroTituloStatus" NOT NULL DEFAULT 'aberto',
    "dataPagamento" TIMESTAMP(3),
    "formaPagamento" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_contrato_parcelas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_contratos_codigo_key" ON "platform_contratos"("codigo");

-- CreateIndex
CREATE INDEX "platform_contratos_tenantId_idx" ON "platform_contratos"("tenantId");

-- CreateIndex
CREATE INDEX "platform_contratos_status_idx" ON "platform_contratos"("status");

-- CreateIndex
CREATE INDEX "platform_contratos_vencimento_idx" ON "platform_contratos"("vencimento");

-- CreateIndex
CREATE INDEX "platform_contrato_parcelas_contratoId_idx" ON "platform_contrato_parcelas"("contratoId");

-- CreateIndex
CREATE INDEX "platform_contrato_parcelas_vencimento_idx" ON "platform_contrato_parcelas"("vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "platform_contrato_parcelas_contratoId_numero_key" ON "platform_contrato_parcelas"("contratoId", "numero");

-- AddForeignKey
ALTER TABLE "platform_contratos" ADD CONSTRAINT "platform_contratos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_contrato_parcelas" ADD CONSTRAINT "platform_contrato_parcelas_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "platform_contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
