#!/usr/bin/env bash
# Rebuild + push + redeploy da api/worker/web no VPS (EasyPanel + registry local).
# Rodar de dentro de /opt/financial, depois de sincronizar o código via WinSCP:
#   cd /opt/financial && sudo bash scripts/redeploy-vps.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 0. Confirmando que o Dockerfile já tem o fix do node_modules..."
if ! grep -q 'COPY --from=build /app/node_modules' apps/api/Dockerfile; then
  echo "ERRO: apps/api/Dockerfile não tem o fix (COPY --from=build /app/node_modules)."
  echo "Sincronize o arquivo via WinSCP antes de rodar este script."
  exit 1
fi
echo "OK: Dockerfile com o fix."

echo "==> 1. Rebuild das imagens (sem cache)..."
docker build --no-cache -f apps/api/Dockerfile --target production -t ethos-api:latest .
docker build --no-cache -f apps/api/Dockerfile --target production-worker -t ethos-worker:latest .
docker build --no-cache -f apps/web/Dockerfile --target production -t ethos-web:latest .

echo "==> 2. Verificando módulos hoisted na imagem do worker..."
docker run --rm ethos-worker:latest node -e "require('bullmq'); require('xlsx'); require('docx'); require('pdfkit'); require('@prisma/client'); console.log('módulos OK')"

echo "==> 3. Tagueando e enviando pro registry local..."
docker tag ethos-api:latest 127.0.0.1:5000/ethos-api:latest
docker tag ethos-worker:latest 127.0.0.1:5000/ethos-worker:latest
docker tag ethos-web:latest 127.0.0.1:5000/ethos-web:latest

docker push 127.0.0.1:5000/ethos-api:latest
docker push 127.0.0.1:5000/ethos-worker:latest
docker push 127.0.0.1:5000/ethos-web:latest

echo "==> 4. Aplicando migrations pendentes do Prisma..."
(cd apps/api && npx prisma migrate deploy)

echo "==> 5. Forçando redeploy dos serviços no Swarm..."
docker service update --force financial_api
docker service update --force financial_worker
docker service update --force financial_web

echo "==> 6. Verificação final..."
echo "--- Imagem do worker (criada em):"
docker inspect 127.0.0.1:5000/ethos-worker:latest --format '{{.Created}}'
echo "--- Status das tasks:"
docker service ps financial_api --no-trunc
docker service ps financial_worker --no-trunc
docker service ps financial_web --no-trunc

echo "==> Concluído. Teste com:"
echo "curl -s https://financ.unifyhub.com.br/api/health"
