# README_VPS.md — Instalação do EthosFinancial em VPS (Ubuntu + Nginx + Cloudflare)

Guia passo a passo para publicar o EthosFinancial 1.0 em um VPS Ubuntu, com Nginx como proxy
reverso/terminador de TLS e o Cloudflare resolvendo o DNS do domínio. Duas rotas de instalação
são cobertas — escolha **uma** delas:

- **[Rota A — Com Docker](#rota-a--instalação-com-docker)** (recomendada: isola dependências, facilita atualização/rollback)
- **[Rota B — Sem Docker](#rota-b--instalação-sem-docker)** (Node, PostgreSQL, Redis e PM2/systemd instalados diretamente no SO)

Ambas terminam no mesmo lugar: Nginx no host servindo `https://SEU_DOMINIO` com certificado TLS,
API respondendo em `/api/*`, worker de filas rodando em background e PostgreSQL/Redis persistindo
dados no VPS.

> Este projeto **não usa** WhatsApp/Evolution API nem IA (Groq/Ollama) — esses recursos foram
> retirados do escopo do 1.0 (ver `docs/PENDENCIAS.md`). Não é necessário provisionar nada
> relacionado a isso neste guia.

---

## 0. Pré-requisitos

- VPS com **Ubuntu 22.04 LTS** (ou 24.04), mínimo recomendado: 2 vCPU / 4 GB RAM / 40 GB SSD.
  (1 vCPU / 2 GB funciona para homologação/baixo volume, mas o build do Angular e o `docker compose build`
  consomem bastante RAM momentaneamente.)
- Acesso `root` (ou usuário com `sudo`) via SSH.
- Um domínio (ou subdomínio) já adicionado à sua conta do **Cloudflare**, com os _nameservers_
  do domínio já apontados para o Cloudflare (isso é pré-condição para os passos de DNS abaixo —
  se ainda não fez isso, faça primeiro no painel do seu registrador).
- IP público do VPS em mãos (`curl -4 ifconfig.co` no próprio VPS mostra o IP).

Nomenclatura usada neste guia (troque pelos seus valores reais):

| Placeholder   | Exemplo                        |
| ------------- | ------------------------------ |
| `SEU_DOMINIO` | `financeiro.suaempresa.com.br` |
| `SEU_IP`      | `203.0.113.10`                 |
| `financeiro`  | `deploy`                       |

---

## 1. Preparar o VPS (comum às duas rotas)

Conecte via SSH como `root` (ou `sudo -i`) e execute:

```bash
# Atualizar o sistema
apt update && apt upgrade -y

# Criar um usuário não-root para operar a aplicação
adduser financeiro
usermod -aG sudo financeiro

# Firewall básico — libera SSH, HTTP e HTTPS apenas
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status

# (Opcional, recomendado) fail2ban contra brute-force de SSH
apt install -y fail2ban
systemctl enable --now fail2ban
```

A partir daqui, reconecte como `SEU_USUARIO` (`ssh SEU_USUARIO@SEU_IP`) e use `sudo` quando indicado.
ssh financeiro@76.13.175.38
pass : financeiro
---

## 2. Configurar o DNS no Cloudflare

1. No painel do Cloudflare, abra a zona do domínio → **DNS** → **Records**.
2. Crie o(s) registro(s) apontando para o VPS:

   | Tipo | Nome                                        | Conteúdo | Proxy status                              |
   | ---- | ------------------------------------------- | -------- | ----------------------------------------- |
   | A    | `financeiro` (ou `@` se for o domínio raiz) | `SEU_IP` | **DNS only** (nuvem cinza) — por enquanto |

   > Deixe **DNS only** (cinza) neste primeiro momento. Isso é necessário para o Certbot
   > conseguir emitir o certificado TLS via desafio HTTP-01 direto no seu VPS (passo 3.5/4.5).
   > Depois que o certificado estiver funcionando, você pode (opcional) mudar para **Proxied**
   > (nuvem laranja) — ver seção 6.

3. Em **SSL/TLS** → **Overview**, deixe o modo em **Full (strict)** desde já (só terá efeito
   real depois que o certificado estiver instalado no VPS e você ativar o proxy laranja).
4. Aguarde a propagação do DNS (geralmente minutos; confirme com `dig SEU_DOMINIO +short` do
   seu computador ou do próprio VPS).

---

## Rota A — Instalação com Docker

### A.1. Instalar Docker Engine + Compose plugin

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Permite rodar `docker` sem sudo (relogar depois deste comando)
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

### A.2. Clonar o projeto

```bash
sudo mkdir -p /opt/ethos-financial
sudo chown $USER:$USER /opt/ethos-financial
cd /opt/ethos-financial
git clone <URL_DO_SEU_REPOSITORIO_GIT> .
```

### A.3. Configurar variáveis de ambiente de produção

```bash
cp .env.example .env
nano .env
```

Ajuste, no mínimo:

```bash
NODE_ENV=production

POSTGRES_USER=ethos
POSTGRES_PASSWORD=<SENHA_FORTE_AQUI>
POSTGRES_DB=ethos_financial
POSTGRES_PORT=5432
DATABASE_URL=postgresql://ethos:<SENHA_FORTE_AQUI>@postgres:5432/ethos_financial

REDIS_PORT=6379
REDIS_URL=redis://redis:6379/0

API_PORT=3000
JWT_SECRET=<GERAR_COM_openssl_rand_-hex_32>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

WEB_PORT=4200

DIAS_ATRASO_MINIMO=90
PASTA_SAIDA_DOCUMENTOS=./output/relatorios
MODELO_DOCX_PROTESTO=./templates/modelo-protesto.docx

INSTITUICAO_NOME=<NOME_DA_INSTITUICAO>
INSTITUICAO_CNPJ=<CNPJ_DA_INSTITUICAO>
MULTA_PERCENTUAL=2
JUROS_DIARIO_PERCENTUAL=0.033
JUROS_CONTAR_DIA_GERACAO=true
```

Gere um `JWT_SECRET` forte:

```bash
openssl rand -hex 32
```

> Não commite o `.env` (já está no `.gitignore`). Guarde uma cópia da senha do Postgres e do
> `JWT_SECRET` em um cofre de senhas da equipe.

### A.4. Criar o `docker-compose.prod.yml`

O `docker-compose.yml` do repositório usa o _target_ `development` (hot-reload, volumes montados
do código-fonte) — bom para o dia a dia de desenvolvimento, mas não para produção. Crie um arquivo
`docker-compose.prod.yml` ao lado dele:

```bash
nano docker-compose.prod.yml
```

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    container_name: ethos-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - ethos_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ethos-network

  redis:
    image: redis:7-alpine
    container_name: ethos-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - ethos_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - ethos-network

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: production
    container_name: ethos-api
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379/0
      NODE_ENV: production
      PORT: 3000
    volumes:
      - ethos_documents_output:/app/output
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ethos-network

  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: production
    container_name: ethos-worker
    restart: unless-stopped
    command: ["node", "dist/jobs/worker.js"]
    env_file: .env
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      REDIS_URL: redis://redis:6379/0
      NODE_ENV: production
    volumes:
      - ethos_documents_output:/app/output
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - ethos-network

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: production
    container_name: ethos-web
    restart: unless-stopped
    ports:
      # Só em loopback — o Nginx do HOST é quem fica exposto na internet (portas 80/443).
      - "127.0.0.1:8080:80"
    depends_on:
      - api
    networks:
      - ethos-network

networks:
  ethos-network:
    driver: bridge

volumes:
  ethos_postgres_data:
  ethos_redis_data:
  ethos_documents_output:
```

> O container `web` já tem, embutido no seu próprio Nginx (`apps/web/nginx.conf`), o proxy de
> `/api/*` para o container `api` — por isso o Nginx do host só precisa apontar para
> `127.0.0.1:8080`, sem se preocupar em separar rotas de API e de frontend.

### A.5. Build e subida dos containers

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Rode as migrations do Prisma (schema já embutido na imagem da API):

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Confirme que a API está respondendo (dentro do VPS, sem passar pelo Nginx ainda):

```bash
curl -s http://127.0.0.1:8080/api/health
```

### A.6. Instalar e configurar o Nginx no host

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Crie o _server block_:

```bash
sudo nano /etc/nginx/sites-available/ethos-financial
```

```nginx
server {
    listen 80;
    server_name SEU_DOMINIO;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 25m;  # planilhas de importação podem ser grandes
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ethos-financial /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### A.7. Emitir o certificado TLS (Let's Encrypt via Certbot)

Com o DNS do Cloudflare ainda em **DNS only** (nuvem cinza — passo 2):

```bash
sudo certbot --nginx -d SEU_DOMINIO
```

O Certbot edita o `server block` automaticamente para escutar em 443 com o certificado e
adiciona um redirect 80→443. Teste a renovação automática:

```bash
sudo certbot renew --dry-run
```

Acesse `https://SEU_DOMINIO` no navegador — a aplicação deve carregar.

> Agora, opcionalmente, siga a [seção 6](#6-opcional-ativar-o-proxy-do-cloudflare-nuvem-laranja)
> para ativar o proxy/CDN do Cloudflare.

---

## Rota B — Instalação sem Docker

### B.1. Instalar Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # deve mostrar v20.x
```

### B.2. Instalar PostgreSQL 16

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

sudo -u postgres psql <<'EOF'
CREATE USER ethos WITH PASSWORD 'SENHA_FORTE_AQUI';
CREATE DATABASE ethos_financial OWNER ethos;
EOF
```

### B.3. Instalar Redis 7

```bash
sudo apt install -y redis-server
sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf
sudo systemctl enable --now redis-server
redis-cli ping   # deve responder PONG
```

### B.4. Clonar e preparar o projeto

```bash
sudo mkdir -p /opt/ethos-financial
sudo chown $USER:$USER /opt/ethos-financial
cd /opt/ethos-financial
git clone <URL_DO_SEU_REPOSITORIO_GIT> .

npm install --workspaces --include-workspace-root
```

### B.5. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

Como aqui tudo roda no próprio host (sem rede Docker), aponte para `localhost`:

```bash
NODE_ENV=production

DATABASE_URL=postgresql://ethos:SENHA_FORTE_AQUI@localhost:5432/ethos_financial

REDIS_URL=redis://localhost:6379/0

API_PORT=3000
JWT_SECRET=<GERAR_COM_openssl_rand_-hex_32>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

DIAS_ATRASO_MINIMO=90
PASTA_SAIDA_DOCUMENTOS=/opt/ethos-financial/output/relatorios
MODELO_DOCX_PROTESTO=/opt/ethos-financial/apps/api/templates/modelo-protesto.docx

INSTITUICAO_NOME=<NOME_DA_INSTITUICAO>
INSTITUICAO_CNPJ=<CNPJ_DA_INSTITUICAO>
MULTA_PERCENTUAL=2
JUROS_DIARIO_PERCENTUAL=0.033
JUROS_CONTAR_DIA_GERACAO=true
```

```bash
mkdir -p /opt/ethos-financial/output/relatorios
openssl rand -hex 32   # usar como JWT_SECRET
```

### B.6. Build da API e migrations

```bash
cd /opt/ethos-financial/apps/api
npx prisma generate
npx prisma migrate deploy
npm run build     # gera apps/api/dist
```

### B.7. Build do frontend Angular

```bash
cd /opt/ethos-financial/apps/web
npm run build -- --configuration production
# saída em apps/web/dist/ethos-financial-web/browser
```

### B.8. Rodar API e worker como serviços `systemd`

```bash
sudo nano /etc/systemd/system/ethos-api.service
```

```ini
[Unit]
Description=EthosFinancial API
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=SEU_USUARIO
WorkingDirectory=/opt/ethos-financial/apps/api
EnvironmentFile=/opt/ethos-financial/.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo nano /etc/systemd/system/ethos-worker.service
```

```ini
[Unit]
Description=EthosFinancial Worker (BullMQ)
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=SEU_USUARIO
WorkingDirectory=/opt/ethos-financial/apps/api
EnvironmentFile=/opt/ethos-financial/.env
ExecStart=/usr/bin/node dist/jobs/worker.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ethos-api ethos-worker
sudo systemctl status ethos-api ethos-worker
```

Confirme que a API responde localmente:

```bash
curl -s http://127.0.0.1:3000/api/health
```

> Alternativa ao `systemd`: usar [PM2](https://pm2.keymetrics.io/) (`npm i -g pm2`,
> `pm2 start dist/server.js --name ethos-api`, `pm2 start dist/jobs/worker.js --name ethos-worker`,
> `pm2 save`, `pm2 startup`). `systemd` é o padrão do Ubuntu e não exige dependência extra.

### B.9. Instalar e configurar o Nginx no host

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/ethos-financial
```

```nginx
server {
    listen 80;
    server_name SEU_DOMINIO;

    root /opt/ethos-financial/apps/web/dist/ethos-financial-web/browser;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 25m;

    gzip on;
    gzip_types text/plain application/javascript application/json text/css;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ethos-financial /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### B.10. Emitir o certificado TLS

Com o DNS do Cloudflare em **DNS only** (nuvem cinza):

```bash
sudo certbot --nginx -d SEU_DOMINIO
sudo certbot renew --dry-run
```

Acesse `https://SEU_DOMINIO` — a aplicação deve carregar.

---

## 3. Verificação final (ambas as rotas)

```bash
curl -sI https://SEU_DOMINIO
curl -s https://SEU_DOMINIO/api/health
```

- Abra o navegador em `https://SEU_DOMINIO`, faça login e teste ao menos:
  - Importação de uma planilha pequena.
  - Geração de um relatório de inadimplência (o worker precisa estar rodando para o job concluir).
  - Download do documento gerado (Word e PDF).

---

## 4. Backups

**PostgreSQL** (adapte o nome do container/usuário conforme a rota escolhida):

```bash
# Rota A (Docker)
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U ethos ethos_financial > backup_$(date +%F).sql

# Rota B (sem Docker)
pg_dump -U ethos -h localhost ethos_financial > backup_$(date +%F).sql
```

Agende isso via `cron` (ex.: diariamente, retendo os últimos N dias) e copie os backups para
fora do VPS (outro storage, bucket, etc.) — um backup que só existe no mesmo servidor não
protege contra a perda do servidor.

**Documentos gerados** (`PASTA_SAIDA_DOCUMENTOS`): inclua o volume `ethos_documents_output`
(Docker) ou a pasta `/opt/ethos-financial/output` (sem Docker) na rotina de backup também.

---

## 5. Atualizações / Deploy de novas versões

**Rota A (Docker):**

```bash
cd /opt/ethos-financial
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

**Rota B (sem Docker):**

```bash
cd /opt/ethos-financial
git pull
npm install --workspaces --include-workspace-root

cd apps/api && npx prisma migrate deploy && npm run build
cd ../web && npm run build -- --configuration production
cd ../..

sudo systemctl restart ethos-api ethos-worker
```

---

## 6. (Opcional) Ativar o proxy do Cloudflare (nuvem laranja)

Depois que `https://SEU_DOMINIO` já estiver funcionando com o certificado do Certbot, você pode
ativar o proxy/CDN do Cloudflare para ganhar cache de estáticos, proteção DDoS e ocultar o IP
real do VPS:

1. No painel do Cloudflare → **DNS**, edite o registro A do domínio e mude o **Proxy status**
   de "DNS only" para **Proxied** (nuvem laranja).
2. Confirme que **SSL/TLS → Overview** está em **Full (strict)** — isso obriga o Cloudflare a
   validar o certificado do seu Nginx (o do Certbot já serve para isso).
3. Teste `https://SEU_DOMINIO` novamente — o tráfego agora passa pelo Cloudflare antes de chegar
   ao VPS. Se aparecer erro 526/525, o certificado do Nginx não está sendo validado corretamente
   (confira `sudo certbot certificates` e `sudo nginx -t`).
4. (Opcional) Em **SSL/TLS → Edge Certificates**, ative **Always Use HTTPS** e **Automatic HTTPS
   Rewrites**.
5. Como o IP do VPS passa a ficar oculto por trás do Cloudflare, ajuste o Nginx para logar o IP
   real do visitante a partir do cabeçalho `CF-Connecting-IP` (módulo `ngx_http_realip_module`,
   já vem no `nginx` padrão do Ubuntu):

   ```nginx
   # /etc/nginx/conf.d/cloudflare-realip.conf
   set_real_ip_from 173.245.48.0/20;
   set_real_ip_from 103.21.244.0/22;
   set_real_ip_from 103.22.200.0/22;
   set_real_ip_from 103.31.4.0/22;
   set_real_ip_from 141.101.64.0/18;
   set_real_ip_from 108.162.192.0/18;
   set_real_ip_from 190.93.240.0/20;
   set_real_ip_from 188.114.96.0/20;
   set_real_ip_from 197.234.240.0/22;
   set_real_ip_from 198.41.128.0/17;
   set_real_ip_from 162.158.0.0/15;
   set_real_ip_from 104.16.0.0/13;
   set_real_ip_from 104.24.0.0/14;
   set_real_ip_from 172.64.0.0/13;
   set_real_ip_from 131.0.72.0/22;
   set_real_ip_from 2400:cb00::/32;
   set_real_ip_from 2606:4700::/32;
   set_real_ip_from 2803:f800::/32;
   set_real_ip_from 2405:b500::/32;
   set_real_ip_from 2405:8100::/32;
   set_real_ip_from 2a06:98c0::/29;
   set_real_ip_from 2c0f:f248::/32;
   real_ip_header CF-Connecting-IP;
   ```

   (Lista de ranges oficiais do Cloudflare: https://www.cloudflare.com/ips/ — revise
   periodicamente, pois pode mudar.)

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

> Se preferir **não** usar o proxy do Cloudflare (deixar "DNS only" permanentemente), tudo
> continua funcionando normalmente — o Cloudflare atua só como resolvedor de DNS nesse caso,
> que é o mínimo pedido neste guia.

---

## 7. Troubleshooting rápido

| Sintoma                                                    | Causa provável                                                      | Verificar                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `502 Bad Gateway` no Nginx                                 | API/web container fora do ar                                        | Docker: `docker compose -f docker-compose.prod.yml ps` / `logs api`. Sem Docker: `systemctl status ethos-api`                  |
| Job de importação/relatório nunca conclui                  | Worker não está rodando ou sem acesso ao Redis                      | Docker: `docker compose -f docker-compose.prod.yml logs worker`. Sem Docker: `systemctl status ethos-worker`, `redis-cli ping` |
| Erro `P1001` do Prisma (não conecta ao banco)              | `DATABASE_URL` errada ou Postgres fora do ar                        | Docker: `docker compose -f docker-compose.prod.yml logs postgres`. Sem Docker: `systemctl status postgresql`                   |
| `526 Invalid SSL certificate` (com proxy Cloudflare ativo) | Certificado do Nginx expirado/inválido                              | `sudo certbot certificates`, `sudo nginx -t`                                                                                   |
| Certbot falha o desafio HTTP-01                            | Registro DNS ainda em "Proxied" (laranja) durante a emissão inicial | Volte para "DNS only" (cinza) só durante a emissão, depois pode voltar a "Proxied"                                             |
| Upload de planilha grande falha com 413                    | `client_max_body_size` do Nginx menor que o arquivo                 | Aumentar em `/etc/nginx/sites-available/ethos-financial`                                                                       |
