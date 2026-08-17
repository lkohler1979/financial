#!/usr/bin/env bash
# Redeploy do EthosFinancial na VPS depois de uma mudanca de codigo (Rota B - sem Docker).
#
# Uso (na VPS, dentro de /opt/financial):
#   ./scripts/deploy.sh
#
# O que faz, em ordem: git pull, instala dependencias (npm workspaces), build
# do backend, migrations do Prisma, build do frontend, restart dos processos
# no PM2 (api + worker; o frontend e servido estaticamente pelo Nginx - ver
# DEPLOY.md). Para no primeiro erro.

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

log() {
  printf '\n\033[1;36m[deploy] %s\033[0m\n' "$1"
}

fail() {
  printf '\n\033[1;31m[deploy] ERRO: %s\033[0m\n' "$1" >&2
  exit 1
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

log "1/6 - Atualizando o repositorio (git pull)"
cd "$ROOT_DIR"

if [ -n "$(git status --porcelain)" ]; then
  log "Alteracoes locais encontradas em $ROOT_DIR - descartando (producao sempre reflete a main)"
  git reset --hard HEAD
  git clean -fd
fi

git fetch origin main
git checkout main
git reset --hard origin/main

log "2/6 - Instalando dependencias (npm workspaces)"
npm install --workspaces --include-workspace-root

log "3/6 - Buildando o backend (prisma generate + tsc)"
cd "$API_DIR"
npx prisma generate
npm run build

log "4/6 - Rodando migrations do Prisma"
npx prisma migrate deploy

log "5/6 - Buildando o frontend (Angular, producao)"
cd "$WEB_DIR"
npm run build -- --configuration production

log "6/6 - Reiniciando os processos no PM2 (api + worker)"
cd "$ROOT_DIR"
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

sleep 2

log "Verificando os processos"
pm2 status

log "Checando as portas locais"
curl -fsS -o /dev/null -w "api    (127.0.0.1:3070/api/health): %{http_code}\n" http://127.0.0.1:3070/api/health || echo "api    (127.0.0.1:3070/api/health): SEM RESPOSTA"
curl -fsS -o /dev/null -w "web/nginx (127.0.0.1:80): %{http_code}\n" http://127.0.0.1:80/ || echo "web/nginx (127.0.0.1:80): SEM RESPOSTA"

log "Deploy concluido"
