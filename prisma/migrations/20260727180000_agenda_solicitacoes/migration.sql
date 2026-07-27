-- AlterEnum
ALTER TYPE "AgendamentoTipo" ADD VALUE 'tarefa';

-- CreateEnum
CREATE TYPE "AgendamentoEscopo" AS ENUM ('pessoal', 'com_gerente');

-- CreateEnum
CREATE TYPE "AgendamentoSolicitacaoStatus" AS ENUM ('nenhuma', 'pendente', 'aprovada', 'recusada');

-- AlterEnum
ALTER TYPE "NotificacaoTipo" ADD VALUE 'agenda_solicitacao';
ALTER TYPE "NotificacaoTipo" ADD VALUE 'agenda_resposta';

-- AlterTable agendamentos
ALTER TABLE "agendamentos" ADD COLUMN "escopo" "AgendamentoEscopo" NOT NULL DEFAULT 'pessoal';
ALTER TABLE "agendamentos" ADD COLUMN "solicitacaoStatus" "AgendamentoSolicitacaoStatus" NOT NULL DEFAULT 'nenhuma';
ALTER TABLE "agendamentos" ADD COLUMN "aprovadoPorId" TEXT;
ALTER TABLE "agendamentos" ADD COLUMN "aprovadoAt" TIMESTAMP(3);
ALTER TABLE "agendamentos" ADD COLUMN "motivoRecusa" TEXT;

-- AlterTable notificacoes
ALTER TABLE "notificacoes" ADD COLUMN "agendamentoId" TEXT;

-- CreateIndex
CREATE INDEX "agendamentos_escopo_idx" ON "agendamentos"("escopo");
CREATE INDEX "agendamentos_solicitacaoStatus_idx" ON "agendamentos"("solicitacaoStatus");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
