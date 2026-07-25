-- AlterTable
ALTER TABLE "users" ADD COLUMN "equipeId" TEXT;

-- CreateTable
CREATE TABLE "equipes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ativo',
    "gerenteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipes_gerenteId_key" ON "equipes"("gerenteId");

-- CreateIndex
CREATE INDEX "equipes_status_idx" ON "equipes"("status");

-- CreateIndex
CREATE INDEX "users_equipeId_idx" ON "users"("equipeId");

-- AddForeignKey
ALTER TABLE "equipes" ADD CONSTRAINT "equipes_gerenteId_fkey" FOREIGN KEY ("gerenteId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "equipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
