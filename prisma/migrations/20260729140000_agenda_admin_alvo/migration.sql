-- CreateEnum
CREATE TYPE "AgendamentoAlvo" AS ENUM ('nenhum', 'todos', 'equipe', 'gerente');

-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN "alvoTipo" "AgendamentoAlvo" NOT NULL DEFAULT 'nenhum';
ALTER TABLE "agendamentos" ADD COLUMN "alvoEquipeId" TEXT;
ALTER TABLE "agendamentos" ADD COLUMN "alvoGerenteId" TEXT;

-- CreateIndex
CREATE INDEX "agendamentos_alvoTipo_idx" ON "agendamentos"("alvoTipo");
CREATE INDEX "agendamentos_alvoEquipeId_idx" ON "agendamentos"("alvoEquipeId");
CREATE INDEX "agendamentos_alvoGerenteId_idx" ON "agendamentos"("alvoGerenteId");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_alvoEquipeId_fkey" FOREIGN KEY ("alvoEquipeId") REFERENCES "equipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_alvoGerenteId_fkey" FOREIGN KEY ("alvoGerenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Eventos antigos criados por admin passam a ser "todos" (comportamento anterior).
UPDATE "agendamentos" AS a
SET "alvoTipo" = 'todos'
FROM "users" u
WHERE a."autorId" = u.id
  AND u.role = 'admin'
  AND a."alvoTipo" = 'nenhum';
