-- Opção (por geração) para incluir também parcelas apenas "vencidas" (menos
-- que o mínimo de dias configurado) no mesmo documento de protesto de uma
-- matrícula que já tem parcela vencida há mais de X dias — decisão do
-- usuário, 2026-07-07.

ALTER TABLE "relatorios_inadimplencia" ADD COLUMN     "incluir_parcelas_vencidas_recentes" BOOLEAN NOT NULL DEFAULT false;
