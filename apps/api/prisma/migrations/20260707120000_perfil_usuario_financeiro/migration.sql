-- Sprint 7 (Autenticação e Perfis): substitui o perfil "OPERADOR" por dois
-- perfis mais específicos, "FINANCEIRO" e "USUARIO", conforme decisão do
-- usuário em 2026-07-07 (ver docs/PENDENCIAS.md).
ALTER TYPE "PerfilUsuario" RENAME VALUE 'OPERADOR' TO 'USUARIO';
ALTER TYPE "PerfilUsuario" ADD VALUE 'FINANCEIRO';

ALTER TABLE "usuarios" ALTER COLUMN "perfil" SET DEFAULT 'USUARIO';
