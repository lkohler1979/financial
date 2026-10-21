-- Autentique passa a ser a plataforma de assinatura padrão.
ALTER TABLE "configuracoes" ALTER COLUMN "assinatura_provedor" SET DEFAULT 'AUTENTIQUE';

-- Quem ainda não configurou a Clicksign passa para a Autentique (não mexe em quem já usa a Clicksign).
UPDATE "configuracoes" SET "assinatura_provedor" = 'AUTENTIQUE' WHERE "clicksign_token_criptografado" IS NULL;
