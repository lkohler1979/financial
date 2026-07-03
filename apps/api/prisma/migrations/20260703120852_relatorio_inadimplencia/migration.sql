-- CreateTable
CREATE TABLE "relatorios_inadimplencia" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parcelas_minimas" INTEGER,
    "dias_atraso" INTEGER,
    "valor_minimo" DECIMAL(12,2),
    "curso_id" TEXT,
    "total_elegiveis" INTEGER NOT NULL DEFAULT 0,
    "total_documentos_gerados" INTEGER NOT NULL DEFAULT 0,
    "itens" JSONB,
    "erros" JSONB,

    CONSTRAINT "relatorios_inadimplencia_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "relatorios_inadimplencia" ADD CONSTRAINT "relatorios_inadimplencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_inadimplencia" ADD CONSTRAINT "relatorios_inadimplencia_curso_id_fkey" FOREIGN KEY ("curso_id") REFERENCES "cursos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
