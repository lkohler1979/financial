-- Garante que uma Configuracao criada do zero (instalacao nova) nasce com os
-- 3 tipos habilitados no Asaas, igual ao default documentado em schema.prisma
-- (a migration anterior já populou a linha existente via UPDATE, mas não
-- deixou DEFAULT na coluna para novas linhas).
ALTER TABLE "configuracoes" ALTER COLUMN "provedor_boleto" SET DEFAULT 'ASAAS';
ALTER TABLE "configuracoes" ALTER COLUMN "provedor_pix" SET DEFAULT 'ASAAS';
ALTER TABLE "configuracoes" ALTER COLUMN "provedor_cartao" SET DEFAULT 'ASAAS';
