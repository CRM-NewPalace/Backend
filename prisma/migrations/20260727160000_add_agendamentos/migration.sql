-- CreateEnum
CREATE TYPE "AgendamentoTipo" AS ENUM ('visita', 'ligacao', 'reuniao', 'outro');

-- CreateEnum
CREATE TYPE "AgendamentoStatus" AS ENUM ('agendado', 'concluido', 'cancelado');

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "AgendamentoTipo" NOT NULL DEFAULT 'visita',
    "status" "AgendamentoStatus" NOT NULL DEFAULT 'agendado',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "local" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agendamentos_leadId_idx" ON "agendamentos"("leadId");

-- CreateIndex
CREATE INDEX "agendamentos_autorId_idx" ON "agendamentos"("autorId");

-- CreateIndex
CREATE INDEX "agendamentos_startsAt_idx" ON "agendamentos"("startsAt");

-- CreateIndex
CREATE INDEX "agendamentos_status_idx" ON "agendamentos"("status");

-- CreateIndex
CREATE INDEX "agendamentos_tipo_idx" ON "agendamentos"("tipo");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
