#!/usr/bin/env bash
# Redeploy do EthosFinancial na VPS depois de uma mudanca de codigo (Rota B - sem Docker).
#
# Uso (na VPS, dentro de /opt/financial):
#   ./scripts/deploy.sh
#
# O que faz, em ordem: git pull, instala dependencias (npm workspaces), build
# do backend, (opcional) backup do banco, migrations do Prisma, build do frontend, restart
# dos processos no PM2 (api + worker; o frontend e servido estaticamente pelo Nginx - ver
# DEPLOY.md) e health check da API. Para no primeiro erro - inclusive se a API nao
# responder depois do restart.
#
# Backup do banco: DESLIGADO por padrao (decisao do usuario, 2026-10-16: "para o futuro").
# Para ligar: DEPLOY_BACKUP=1 no ambiente ou no /opt/financial/.env (e instalar
# postgresql-client na VPS para ter o pg_dump).

set -euo pipefail

# Evita o prompt interativo "Would you like to share pseudonymous usage
# data..." do Angular CLI na primeira vez que `ng build` roda no ambiente -
# sem TTY (como aqui, dentro de um script), esse prompt pode travar o
# deploy indefinidamente em vez de simplesmente pular a pergunta.
export NG_CLI_ANALYTICS=false

ROOT_DIR="/opt/financial"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
LOCK_FILE="/tmp/ethos-deploy.lock"
# Fora do repositorio: o deploy faz "git clean" em $ROOT_DIR e apagaria backups guardados la dentro.
BACKUP_DIR="/opt/ethos-backups"
BACKUPS_MANTIDOS=10
HEALTH_URL="http://127.0.0.1:3070/api/health"
HEALTH_TENTATIVAS=20

log() {
  printf '\n\033[1;36m[deploy] %s\033[0m\n' "$1"
}

fail() {
  printf '\n\033[1;31m[deploy] ERRO: %s\033[0m\n' "$1" >&2
  exit 1
}

# O backup so roda se DEPLOY_BACKUP=1 (ambiente ou .env). Desligado por padrao.
backup_ligado() {
  [ "${DEPLOY_BACKUP:-0}" = "1" ] || grep -qE '^DEPLOY_BACKUP=1[[:space:]]*$' "$ROOT_DIR/.env" 2>/dev/null
}

# Backup do banco antes das migrations (o banco nao tem rollback). Le DATABASE_URL do .env, tira o
# "?schema=..." que o pg_dump nao aceita e guarda os ultimos $BACKUPS_MANTIDOS arquivos.
fazer_backup() {
  local url
  url="$(grep -E '^DATABASE_URL=' "$ROOT_DIR/.env" | head -n1 | cut -d= -f2- | tr -d "\"'")"
  [ -n "$url" ] || fail "DATABASE_URL nao encontrado em $ROOT_DIR/.env - nao da para fazer o backup"
  command -v pg_dump >/dev/null 2>&1 || fail "pg_dump nao instalado na VPS (apt install postgresql-client) - backup obrigatorio antes das migrations"

  mkdir -p "$BACKUP_DIR"
  local arquivo
  arquivo="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
  pg_dump "${url%%\?*}" --format=custom --file="$arquivo" || fail "falha no backup do banco ($arquivo)"
  log "Backup salvo em $arquivo ($(du -h "$arquivo" | cut -f1))"

  # Mantem so os mais recentes.
  ls -1t "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +"$((BACKUPS_MANTIDOS + 1))" | xargs -r rm -f
}

# A API precisa responder depois do restart; senao o deploy FALHA (o PM2 pode estar "online" com a
# aplicacao quebrada). Tenta por ate ~HEALTH_TENTATIVAS * 2s para dar tempo de subir.
verificar_saude() {
  local i
  for i in $(seq 1 "$HEALTH_TENTATIVAS"); do
    if curl -fsS -o /dev/null "$HEALTH_URL"; then
      log "API respondendo ($HEALTH_URL) apos $i tentativa(s)"
      return 0
    fi
    sleep 2
  done
  pm2 logs ethos-api --lines 40 --nostream || true
  fail "a API nao respondeu em $HEALTH_URL apos o restart. O codigo novo esta no ar mas com problema: veja os logs acima. Para voltar o codigo, 'git reset --hard <commit anterior>' e rode este script de novo."
}

exec 200>"$LOCK_FILE"
flock -n 200 || fail "ja existe um deploy em andamento (lock: $LOCK_FILE)"

[ -d "$ROOT_DIR/.git" ] || fail "repositorio nao encontrado em $ROOT_DIR"
[ -f "$ROOT_DIR/.env" ] || fail "faltando $ROOT_DIR/.env (veja DEPLOY.md, secao B.5)"
[ -f "$API_DIR/.env" ] || fail "faltando o link $API_DIR/.env -> ../../.env (veja DEPLOY.md, secao B.5)"

# Evita o erro "detected dubious ownership" do Git quando o script roda com
# um usuario diferente do dono da pasta (ex.: root por engano em vez do
# usuario da aplicacao). Confere antes de adicionar para nao duplicar a
# entrada em ~/.gitconfig a cada execucao.
if ! git config --global --get-all safe.directory 2>/dev/null | grep -qx "$ROOT_DIR"; then
  git config --global --add safe.directory "$ROOT_DIR"
fi

log "1/7 - Atualizando o repositorio (git pull)"
cd "$ROOT_DIR"

if [ -n "$(git status --porcelain)" ]; then
  log "Alteracoes locais encontradas em $ROOT_DIR - descartando (producao sempre reflete a main)"
  git reset --hard HEAD
  git clean -fd
fi

git fetch origin main
git checkout main
git reset --hard origin/main

log "2/7 - Instalando dependencias (npm workspaces)"
npm install --workspaces --include-workspace-root

log "3/7 - Buildando o backend (prisma generate + tsc)"
cd "$API_DIR"
npx prisma generate
npm run build

log "4/7 - Backup do banco (antes das migrations)"
if backup_ligado; then
  fazer_backup
else
  log "Backup desligado (DEPLOY_BACKUP=1 liga) - seguindo sem backup"
fi

log "5/7 - Rodando migrations do Prisma"
cd "$API_DIR"
npx prisma migrate deploy

log "6/7 - Buildando o frontend (Angular, producao)"
cd "$WEB_DIR"
npm run build -- --configuration production

log "7/7 - Reiniciando os processos no PM2 (api + worker)"
cd "$ROOT_DIR"
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

log "Verificando os processos"
pm2 status

log "Health check da API"
verificar_saude

# O Nginx responde por host (server_name): 404 em 127.0.0.1 e normal, entao so informa.
curl -sS -o /dev/null -w "web/nginx (127.0.0.1:80): %{http_code}\n" http://127.0.0.1:80/ || echo "web/nginx (127.0.0.1:80): SEM RESPOSTA"

log "Deploy concluido"
