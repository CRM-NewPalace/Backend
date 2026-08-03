-- CreateEnum
CREATE TYPE "FinanceiroParceiroTipo" AS ENUM ('cliente', 'fornecedor', 'ambos');

-- CreateEnum
CREATE TYPE "FinanceiroTituloStatus" AS ENUM ('aberto', 'pago', 'atrasado', 'cancelado');

-- CreateEnum
CREATE TYPE "FinanceiroTituloTipo" AS ENUM ('receber', 'pagar');

-- CreateEnum
CREATE TYPE "FinanceiroMovimentoTipo" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "FinanceiroComissaoStatus" AS ENUM ('pendente', 'liberada', 'paga');

-- CreateTable
CREATE TABLE "financeiro_parceiros" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "tipo" "FinanceiroParceiroTipo" NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "cidade" TEXT,
    "saldoAberto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_parceiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_movimentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "parceiroId" TEXT,
    "parceiroNome" TEXT NOT NULL DEFAULT '',
    "categoria" TEXT NOT NULL,
    "centro" TEXT NOT NULL DEFAULT '',
    "tipo" "FinanceiroMovimentoTipo" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "FinanceiroTituloStatus" NOT NULL DEFAULT 'aberto',
    "formaPagamento" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_movimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_titulos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "FinanceiroTituloTipo" NOT NULL,
    "descricao" TEXT NOT NULL,
    "parceiroId" TEXT,
    "parceiroNome" TEXT NOT NULL DEFAULT '',
    "categoria" TEXT NOT NULL DEFAULT '',
    "centro" TEXT NOT NULL DEFAULT '',
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "FinanceiroTituloStatus" NOT NULL DEFAULT 'aberto',
    "parcela" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_titulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financeiro_comissoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "corretor" TEXT NOT NULL,
    "equipe" TEXT NOT NULL DEFAULT '',
    "empreendimento" TEXT NOT NULL DEFAULT '',
    "cliente" TEXT NOT NULL DEFAULT '',
    "dataVenda" TIMESTAMP(3) NOT NULL,
    "vgv" DOUBLE PRECISION NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" "FinanceiroComissaoStatus" NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financeiro_parceiros_tenantId_idx" ON "financeiro_parceiros"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_parceiros_tenantId_tipo_idx" ON "financeiro_parceiros"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "financeiro_parceiros_tenantId_ativo_idx" ON "financeiro_parceiros"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "financeiro_parceiros_nome_idx" ON "financeiro_parceiros"("nome");

-- CreateIndex
CREATE INDEX "financeiro_movimentos_tenantId_idx" ON "financeiro_movimentos"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_movimentos_tenantId_data_idx" ON "financeiro_movimentos"("tenantId", "data");

-- CreateIndex
CREATE INDEX "financeiro_movimentos_parceiroId_idx" ON "financeiro_movimentos"("parceiroId");

-- CreateIndex
CREATE INDEX "financeiro_titulos_tenantId_idx" ON "financeiro_titulos"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_titulos_tenantId_tipo_idx" ON "financeiro_titulos"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "financeiro_titulos_tenantId_vencimento_idx" ON "financeiro_titulos"("tenantId", "vencimento");

-- CreateIndex
CREATE INDEX "financeiro_titulos_parceiroId_idx" ON "financeiro_titulos"("parceiroId");

-- CreateIndex
CREATE INDEX "financeiro_comissoes_tenantId_idx" ON "financeiro_comissoes"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_comissoes_tenantId_dataVenda_idx" ON "financeiro_comissoes"("tenantId", "dataVenda");

-- AddForeignKey
ALTER TABLE "financeiro_parceiros" ADD CONSTRAINT "financeiro_parceiros_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_movimentos" ADD CONSTRAINT "financeiro_movimentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_movimentos" ADD CONSTRAINT "financeiro_movimentos_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "financeiro_parceiros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_titulos" ADD CONSTRAINT "financeiro_titulos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_titulos" ADD CONSTRAINT "financeiro_titulos_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "financeiro_parceiros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financeiro_comissoes" ADD CONSTRAINT "financeiro_comissoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
