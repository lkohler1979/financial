# DEPLOY.md — Publicar o EthosFinancial em produção

Guia de deploy do EthosFinancial 1.0 no VPS de produção:

- **Domínio:** `https://financ.unifyhub.com.br`
- **SO do VPS:** Ubuntu (22.04 LTS ou 24.04)
- **DNS/Proxy:** Cloudflare
- **Proxy reverso/TLS:** Nginx no host

Três rotas de instalação são cobertas — escolha **uma** delas:

- **[Rota A — Com Docker](#rota-a--instalação-com-docker)** (recomendada quando o VPS é
  dedicado a este projeto: isola dependências, facilita atualização/rollback)
- **[Rota B — Sem Docker](#rota-b--instalação-sem-docker)** (Node, PostgreSQL, Redis e systemd
  instalados direto no SO — também assume VPS dedicado)
- **[Rota C — Via EasyPanel](#rota-c--via-easypanel-vps-compartilhado-com-traefik)**
  (obrigatória se o VPS **já roda outros apps via EasyPanel/Traefik** — as portas 80/443 já
  pertencem ao Traefik, então as Rotas A/B não conseguem subir o próprio nginx nelas)

Antes de escolher, rode `sudo docker ps --format '{{.Names}}\t{{.Ports}}'` no VPS: se aparecer
um serviço tipo `*-traefik` publicando `0.0.0.0:80->80/tcp` e `0.0.0.0:443->443/tcp`, use a
**Rota C**. Se a porta 80/443 estiver livre (VPS novo/dedicado), use a **Rota A** (ou B).

As Rotas A/B terminam no mesmo lugar: Nginx no host servindo
`https://financ.unifyhub.com.br` com certificado TLS, API respondendo em `/api/*`,
worker de filas em background e PostgreSQL/Redis persistindo dados no VPS. A Rota C chega no
mesmo resultado, mas delegando o proxy/TLS ao Traefik que o EasyPanel já gerencia.

> Este projeto **não usa** WhatsApp/Evolution API nem IA (Groq/Ollama) — esses recursos foram
> retirados do escopo do 1.0 (ver `docs/PENDENCIAS.md`). Não é necessário provisionar nada
> relacionado a isso neste guia.

> ⚠️ **Não guarde IP, usuário ou senha do VPS em texto puro em nenhum arquivo versionado do
> repositório** (README, `.md`, etc.) — use um cofre de senhas da equipe. Este guia usa
> placeholders (`SEU_IP`, `SEU_USUARIO`) de propósito.

---

## 0. Pré-requisitos

- VPS com **Ubuntu 22.04 LTS** (ou 24.04), mínimo recomendado: 2 vCPU / 4 GB RAM / 40 GB SSD.
  (1 vCPU / 2 GB funciona para homologação/baixo volume, mas o build do Angular e o
  `docker compose build` consomem bastante RAM momentaneamente.)
- Acesso `root` (ou usuário com `sudo`) via SSH ao VPS.
- O domínio `unifyhub.com.br` já configurado no **Cloudflare** (nameservers do domínio já
  apontados para o Cloudflare) — `financ` será o subdomínio usado para esta aplicação.
- IP público do VPS em mãos (`curl -4 ifconfig.co` no próprio VPS mostra o IP).

Nomenclatura usada neste guia (troque pelos seus valores reais):

| Placeholder   | Uso                                                |
| ------------- | -------------------------------------------------- |
| `SEU_IP`      | IP público do VPS (ex.: `203.0.113.10`)            |
| `SEU_USUARIO` | usuário não-root criado no passo 1 (ex.: `deploy`) |

O domínio já é fixo neste guia: **`financ.unifyhub.com.br`**.

---

## 1. Preparar o VPS (comum às três rotas)

Conecte via SSH como `root` (ou `sudo -i`):

```bash
ssh root@SEU_IP
```

E execute:

```bash
# Atualizar o sistema
apt update && apt upgrade -y

# Criar um usuário não-root para operar a aplicação
adduser SEU_USUARIO
usermod -aG sudo SEU_USUARIO

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

A partir daqui, reconecte como `SEU_USUARIO` (`ssh SEU_USUARIO@SEU_IP`) e use `sudo` quando
indicado. Prefira autenticação por chave SSH em vez de senha (`ssh-copy-id SEU_USUARIO@SEU_IP`
a partir da sua máquina, depois desabilite login por senha em `/etc/ssh/sshd_config`).

---

## 2. Configurar o DNS no Cloudflare

1. No painel do Cloudflare, abra a zona **`unifyhub.com.br`** → **DNS** → **Records**.
2. Crie o registro apontando para o VPS:

   | Tipo | Nome             | Conteúdo | Proxy status                              |
   | ---- | ---------------- | -------- | ----------------------------------------- |
   | A    | `financ` | `SEU_IP` | **DNS only** (nuvem cinza) — por enquanto |

   Isso publica `financ.unifyhub.com.br` apontando para o VPS.

   > Deixe **DNS only** (cinza) neste primeiro momento. Isso é necessário para o Certbot
   > conseguir emitir o certificado TLS via desafio HTTP-01 direto no seu VPS (passo A.7/B.10).
   > Depois que o certificado estiver funcionando, você pode (opcional) mudar para **Proxied**
   > (nuvem laranja) — ver seção 6.

3. Em **SSL/TLS** → **Overview**, deixe o modo em **Full (strict)** desde já (só terá efeito
   real depois que o certificado estiver instalado no VPS e você ativar o proxy laranja).
4. Aguarde a propagação do DNS (geralmente minutos; confirme com):

   ```bash
   dig financ.unifyhub.com.br +short
   ```

   O IP retornado deve ser o `SEU_IP` do VPS.

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

### A.2. Enviar os arquivos do projeto (WinSCP)

O projeto está só local (sem repositório remoto) — em vez de `git clone`, envie os arquivos do
seu computador Windows para o VPS usando o **WinSCP**.

1. No VPS (via SSH), crie a pasta de destino já com o dono certo:

   ```bash
   sudo mkdir -p /opt/ethos-financial
   sudo chown SEU_USUARIO:SEU_USUARIO /opt/ethos-financial
   ```

2. Abra o WinSCP e crie uma nova sessão:
   - **Protocolo de arquivo:** SFTP
   - **Nome do host:** `SEU_IP`
   - **Porta:** `22`
   - **Usuário:** `SEU_USUARIO`
   - **Autenticação:** sua chave privada SSH (recomendado — converta a `.pem`/`.ppk` se
     necessário) ou senha

3. Conecte. No painel **esquerdo** (local), navegue até a pasta do projeto no seu computador
   (ex.: `C:\DSI\Git\EthosFinancial`). No painel **direito** (remoto), entre em
   `/opt/ethos-financial`.

4. **Antes de enviar**, configure uma máscara de exclusão para não subir o que será
   reinstalado/gerado no próprio VPS (deixa a transferência bem mais rápida e evita subir
   segredos locais por engano): no menu **Commands → Advanced → File Mask** (ou no campo
   "Máscara de arquivo" da tela de transferência), use:

   ```text
   |node_modules/; */node_modules/; dist/; */dist/; .angular/; */.angular/; .git/; .env
   ```

   Isso exclui `node_modules` e `dist` de qualquer subpasta (`apps/api`, `apps/web`, raiz),
   `.angular/` (cache de build do Angular), `.git/` (não é necessário para rodar) e o seu
   `.env` de desenvolvimento local (no VPS você cria um `.env` de produção novo a partir do
   `.env.example` — ver o próximo passo).

5. Selecione tudo no painel local e arraste para o painel remoto (ou botão direito →
   **Upload**). Aguarde a transferência terminar — a primeira leva alguns minutos.

6. Para enviar atualizações depois (sem reenviar tudo de novo), use
   **Commands → Synchronize... → "Local directory" → Remote**, mantendo a mesma máscara de
   exclusão do passo 4. Veja também a seção 5 (Atualizações) mais abaixo.

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

# Usados só para criar o primeiro usuário ADMINISTRADOR, se ainda não existir
# nenhum — troque a senha pela tela de gestão de usuários depois do login.
ADMIN_EMAIL=admin@financ.local
ADMIN_PASSWORD=<SENHA_FORTE_AQUI>

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

> Não commite o `.env` (já está no `.gitignore`). Guarde uma cópia da senha do Postgres, do
> `JWT_SECRET` e do `ADMIN_PASSWORD` em um cofre de senhas da equipe — nunca num arquivo do repositório.

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

### A.5. Build, subida dos containers e migrations

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps

docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Confirme que a API está respondendo (dentro do VPS, sem passar pelo Nginx ainda):

```bash
curl -s http://127.0.0.1:8080/api/health
```

### A.6. Instalar e configurar o Nginx no host

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/financ
```

```nginx
server {
    listen 80;
    server_name financ.unifyhub.com.br;

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
sudo ln -s /etc/nginx/sites-available/financ /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### A.7. Emitir o certificado TLS (Let's Encrypt via Certbot)

Com o DNS do Cloudflare ainda em **DNS only** (nuvem cinza — passo 2):

```bash
sudo certbot --nginx -d financ.unifyhub.com.br
sudo certbot renew --dry-run
```

O Certbot edita o `server block` automaticamente para escutar em 443 com o certificado e
adiciona um redirect 80→443.

Acesse `https://financ.unifyhub.com.br` no navegador — a aplicação deve carregar.

> Agora, opcionalmente, siga a [seção 6](#6-opcional-ativar-o-proxy-do-cloudflare-nuvem-laranja)
> para ativar o proxy/CDN do Cloudflare.

**Pule para a [seção 3 — verificação final](#3-verificação-final-todas-as-rotas).**

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

### B.4. Enviar os arquivos do projeto (WinSCP) e instalar dependências

Como na Rota A, o projeto é só local — envie via **WinSCP** em vez de `git clone`:

1. No VPS (via SSH):

   ```bash
   sudo mkdir -p /opt/ethos-financial
   sudo chown SEU_USUARIO:SEU_USUARIO /opt/ethos-financial
   ```

2. No WinSCP, conecte (`SEU_IP` / `SEU_USUARIO` / SFTP, porta 22) e envie o conteúdo da pasta
   local do projeto (ex.: `C:\DSI\Git\EthosFinancial`) para `/opt/ethos-financial`, usando a
   mesma máscara de exclusão do passo A.2 (`node_modules/`, `dist/`, `.angular/`, `.git/`,
   `.env`) — o passo A.2 acima tem o detalhe completo de como configurar isso no WinSCP.

3. De volta ao SSH, garanta que tudo pertence ao `SEU_USUARIO` (qualquer arquivo criado por
   `root` no meio do caminho — ex.: se alguma pasta foi criada com `sudo` — quebra o `npm run
build` mais adiante com `EACCES: permission denied`) e instale as dependências:

   ```bash
   sudo chown -R SEU_USUARIO:SEU_USUARIO /opt/ethos-financial
   cd /opt/ethos-financial
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

ADMIN_EMAIL=admin@financ.local
ADMIN_PASSWORD=<SENHA_FORTE_AQUI>

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

O `.env` fica na **raiz** do projeto (`/opt/ethos-financial/.env`), mas os comandos do Prisma
e o `dotenv/config` que a API usa procuram `.env` relativo ao diretório onde o comando é
executado — que nos próximos passos é `apps/api/`. Crie um link simbólico para o Prisma CLI e o
Node encontrarem o mesmo arquivo dali (evita o erro `Environment variable not found:
DATABASE_URL` do Prisma):

```bash
ln -s ../../.env /opt/ethos-financial/apps/api/.env
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
sudo nano /etc/nginx/sites-available/financ
```

```nginx
server {
    listen 80;
    server_name financ.unifyhub.com.br;

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
sudo ln -s /etc/nginx/sites-available/financ /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### B.10. Emitir o certificado TLS

Com o DNS do Cloudflare em **DNS only** (nuvem cinza):

```bash
sudo certbot --nginx -d financ.unifyhub.com.br
sudo certbot renew --dry-run
```

Acesse `https://financ.unifyhub.com.br` — a aplicação deve carregar.

---

## Rota C — Via EasyPanel (VPS compartilhado com Traefik)

> **Use esta rota se o VPS já roda outras aplicações via [EasyPanel](https://easypanel.io/)**
> (ex.: n8n, Evolution API de outro projeto, etc.) — nesse caso as portas 80/443 já pertencem
> ao **Traefik** que o EasyPanel gerencia, e as Rotas A/B acima **não funcionam**: o nginx
> próprio delas não consegue `bind()` nas portas 80/443 (erro `Address already in use`), e
> parar o Traefik para liberar a porta tiraria do ar todos os outros apps desse servidor.
>
> Confirme isso rodando `sudo docker ps --format '{{.Names}}\t{{.Ports}}'` — se aparecer um
> serviço tipo `*-traefik` publicando `0.0.0.0:80->80/tcp` e `0.0.0.0:443->443/tcp`, é este o
> seu caso.

Em vez de instalar Nginx/Certbot no host, o EthosFinancial é criado como um **Project** dentro
do próprio EasyPanel — ele já sabe conversar com o Traefik que está rodando (rotas, TLS via
Let's Encrypt, rede interna entre os serviços), então os passos A.6/A.7/B.9/B.10 (Nginx +
Certbot) **não se aplicam** nesta rota.

### C.1. Enviar os arquivos e buildar as imagens (sem Git remoto)

O EasyPanel builda "App" services a partir de duas origens: **GitHub** ou **Docker Image** — não
tem um botão de "buildar a partir de pasta local" (varia entre versões, e a v2.32.1 não tem).
Como o projeto não tem repositório remoto, o caminho confiável é: enviar os arquivos via
**WinSCP** e **buildar as imagens Docker manualmente por SSH**, apontando os serviços do
EasyPanel para essas imagens já existentes no Docker do próprio servidor (origem **"Docker
Image"**, sem precisar de registry).

1. Envie os arquivos via WinSCP para o VPS (mesmo processo do passo A.2 — sessão SFTP, mesma
   máscara de exclusão `node_modules/`, `dist/`, `.angular/`, `.git/`, `.env`), por exemplo para
   `/opt/ethos-financial`.

2. Via SSH, builde as três imagens que os serviços vão usar (o `apps/api/Dockerfile` tem um
   estágio `production-worker` dedicado — mesma imagem da API, só com o comando padrão trocado
   para rodar o worker, já que o EasyPanel v2.32.1 não tem um campo de "Start Command" fácil de
   sobrescrever por serviço quando a origem é "Docker Image"):

   ```bash
   cd /opt/ethos-financial
   docker build -f apps/api/Dockerfile --target production -t ethos-api:latest .
   docker build -f apps/api/Dockerfile --target production-worker -t ethos-worker:latest .
   docker build -f apps/web/Dockerfile --target production -t ethos-web:latest .
   ```

3. Ao criar cada serviço no EasyPanel (passo C.2), escolha origem **"Docker Image"** e informe:
   - `api` → `ethos-api:latest`
   - `worker` → `ethos-worker:latest`
   - `web` → `ethos-web:latest`

4. **Para atualizar depois:** sincronize os arquivos de novo via WinSCP, rode os três `docker
build` de novo (as tags são sobrescritas) e clique em **Redeploy** (ou **Force
   Rebuild/Recreate**) no serviço correspondente do EasyPanel para ele recriar o container com a
   imagem nova — ver também a seção 5 (Atualizações).

### C.2. Criar o Project e os serviços

Crie um **Project** novo (ex.: `financ`) e, dentro dele, os seguintes **Services**:

| Serviço    | Tipo                           | Origem / imagem (ver passo C.1) | Observação                                                                                                                            |
| ---------- | ------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | Template **Postgres 16**       | template pronto do EasyPanel    | Defina usuário/senha/nome do banco (ex.: `ethos` / `SENHA_FORTE_AQUI` / `ethos_financial`)                                            |
| `redis`    | Template **Redis**             | template pronto do EasyPanel    | Sem configuração extra necessária                                                                                                     |
| `api`      | **App** (origem: Docker Image) | `ethos-api:latest`              | Ver variáveis de ambiente abaixo                                                                                                      |
| `worker`   | **App** (origem: Docker Image) | `ethos-worker:latest`           | Imagem já roda `node dist/jobs/worker.js` por padrão (estágio `production-worker` do Dockerfile) — não precisa mexer em Start Command |
| `web`      | **App** (origem: Docker Image) | `ethos-web:latest`              | É aqui que o domínio público é configurado (passo C.4)                                                                                |

Nos serviços `api` e `worker`, configure as variáveis de ambiente (aba **Environment** de cada
serviço) com os mesmos valores do `.env` usado nas Rotas A/B — a diferença é que `DATABASE_URL`
e `REDIS_URL` apontam para o **nome do serviço** dentro do Project (o EasyPanel resolve isso
pela rede interna, de forma parecida com o `docker-compose.yml` do projeto):

```bash
NODE_ENV=production
DATABASE_URL=postgresql://ethos:SENHA_FORTE_AQUI@postgres:5432/ethos_financial
REDIS_URL=redis://redis:6379/0
JWT_SECRET=023b2fdae7cc65072b1dc94cf59a4dd6499d1a8784e0611c7dc2187e24e6f6c6
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
ADMIN_EMAIL=admin@financ.local
ADMIN_PASSWORD=<SENHA_FORTE_AQUI>
DIAS_ATRASO_MINIMO=90
PASTA_SAIDA_DOCUMENTOS=./output/relatorios
MODELO_DOCX_PROTESTO=./templates/modelo-protesto.docx
INSTITUICAO_NOME=<NOME_DA_INSTITUICAO>
INSTITUICAO_CNPJ=<CNPJ_DA_INSTITUICAO>
MULTA_PERCENTUAL=2
JUROS_DIARIO_PERCENTUAL=0.033
JUROS_CONTAR_DIA_GERACAO=true
PORT=3000
```

> Ajuste `postgres`/`redis` acima para o nome real que o EasyPanel deu aos serviços dentro do
> Project, se for diferente.

### C.3. Rodar as migrations do Prisma

Depois que o serviço `api` estiver rodando, abra o **Console/Terminal** dele (a maioria das
versões do EasyPanel tem essa opção por serviço) e rode:

```bash
npx prisma migrate deploy
```

### C.4. Configurar o domínio (Traefik + TLS automático)

No serviço **`web`**, vá na aba **Domains** e adicione `financ.unifyhub.com.br`. O
EasyPanel provisiona o certificado Let's Encrypt automaticamente pelo Traefik já em execução,
desde que o DNS do Cloudflare já esteja resolvendo para o IP do VPS (registro A criado no
passo 2 deste guia, em modo **DNS only**).

### C.5. Verificar

```bash
curl -sI https://financ.unifyhub.com.br
curl -s https://financ.unifyhub.com.br/api/health
```

Se o serviço `web` tiver, embutido no seu próprio Nginx interno (`apps/web/nginx.conf`), o
proxy de `/api/*` para o serviço `api` (mesmo padrão das Rotas A/B) — confirme que ambos os
serviços estão no ar e na mesma rede do Project caso `/api/health` não responda.

> **Nomes de botão/aba do EasyPanel podem variar por versão** (`Domains`, `Start Command`,
> `Console`/`Terminal`, etc.) — os nomes usados acima são os mais comuns nas versões recentes;
> se algo não bater exatamente com o que você vê na tela, consulte a
> [documentação oficial do EasyPanel](https://easypanel.io/docs).

**Pule para a [seção 3 — verificação final](#3-verificação-final-todas-as-rotas).**

---

## 3. Verificação final (todas as rotas)

```bash
curl -sI https://financ.unifyhub.com.br
curl -s https://financ.unifyhub.com.br/api/health
```

- Abra o navegador em `https://financ.unifyhub.com.br`, faça login com o usuário
  administrador (`ADMIN_EMAIL`/`ADMIN_PASSWORD` do `.env`) e teste ao menos:
  - Importação de uma planilha pequena.
  - Geração de um relatório de inadimplência (o worker precisa estar rodando para o job concluir).
  - Download do documento gerado (Word e PDF).
  - Trocar a senha do usuário administrador pela tela de gestão de usuários.

---

## 4. Backups

**PostgreSQL** (adapte o nome do container/usuário conforme a rota escolhida):

```bash
# Rota A (Docker)
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U ethos ethos_financial > backup_$(date +%F).sql

# Rota B (sem Docker)
pg_dump -U ethos -h localhost ethos_financial > backup_$(date +%F).sql

# Rota C (EasyPanel) — via console do serviço "postgres", ou docker exec direto:
sudo docker exec <container_do_postgres> pg_dump -U ethos ethos_financial > backup_$(date +%F).sql
```

Agende isso via `cron` (ex.: diariamente, retendo os últimos N dias) e copie os backups para
fora do VPS (outro storage, bucket, etc.) — um backup que só existe no mesmo servidor não
protege contra a perda do servidor.

**Documentos gerados** (`PASTA_SAIDA_DOCUMENTOS`): inclua o volume `ethos_documents_output`
(Docker) ou a pasta `/opt/ethos-financial/output` (sem Docker) na rotina de backup também.

---

## 5. Atualizações / Deploy de novas versões

Sem repositório remoto, uma atualização é: sincronizar os arquivos alterados via WinSCP e então
reconstruir/reiniciar no VPS.

1. No WinSCP, com a sessão já salva do passo A.2/B.4, use
   **Commands → Synchronize... → "Local directory" → Remote**, apontando para a pasta local do
   projeto e `/opt/ethos-financial` no remoto — mantenha a mesma máscara de exclusão
   (`node_modules/`, `dist/`, `.angular/`, `.git/`, `.env`), senão o `.env` de produção do VPS
   seria sobrescrito pelo seu `.env` de dev local. O WinSCP mostra um preview do que vai mudar
   antes de confirmar.

2. Depois de sincronizado, no VPS (via SSH):

**Rota A (Docker):**

```bash
cd /opt/ethos-financial
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

**Rota B (sem Docker):**

```bash
cd /opt/ethos-financial
npm install --workspaces --include-workspace-root

cd apps/api && npx prisma migrate deploy && npm run build
cd ../web && npm run build -- --configuration production
cd ../..

sudo systemctl restart ethos-api ethos-worker
```

**Rota C (EasyPanel):** sincronize os arquivos de novo via WinSCP, rode os três `docker build`
do passo C.1 de novo (sobrescreve as tags `ethos-api:latest`/`ethos-web:latest`) e clique em
**Redeploy**/**Force Rebuild** nos serviços `api`, `worker` e `web` no painel do EasyPanel;
depois rode `npx prisma migrate deploy` pelo Console do serviço `api` (passo C.3).

---

## 6. (Opcional) Ativar o proxy do Cloudflare (nuvem laranja)

Depois que `https://financ.unifyhub.com.br` já estiver funcionando com o certificado do
Certbot, você pode ativar o proxy/CDN do Cloudflare para ganhar cache de estáticos, proteção
DDoS e ocultar o IP real do VPS:

1. No painel do Cloudflare → **DNS**, edite o registro A `financ` e mude o **Proxy
   status** de "DNS only" para **Proxied** (nuvem laranja).
2. Confirme que **SSL/TLS → Overview** está em **Full (strict)** — isso obriga o Cloudflare a
   validar o certificado do seu Nginx (o do Certbot já serve para isso).
3. Teste `https://financ.unifyhub.com.br` novamente — o tráfego agora passa pelo
   Cloudflare antes de chegar ao VPS. Se aparecer erro 526/525, o certificado do Nginx não está
   sendo validado corretamente (confira `sudo certbot certificates` e `sudo nginx -t`).
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
> continua funcionando normalmente — o Cloudflare atua só como resolvedor de DNS nesse caso.

---

## 7. Troubleshooting rápido

| Sintoma                                                                   | Causa provável                                                                                                                                       | Verificar                                                                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `502 Bad Gateway` no Nginx                                                | API/web container fora do ar                                                                                                                         | Docker: `docker compose -f docker-compose.prod.yml ps` / `logs api`. Sem Docker: `systemctl status ethos-api`                  |
| Job de importação/relatório nunca conclui                                 | Worker não está rodando ou sem acesso ao Redis                                                                                                       | Docker: `docker compose -f docker-compose.prod.yml logs worker`. Sem Docker: `systemctl status ethos-worker`, `redis-cli ping` |
| Erro `P1001` do Prisma (não conecta ao banco)                             | `DATABASE_URL` errada ou Postgres fora do ar                                                                                                         | Docker: `docker compose -f docker-compose.prod.yml logs postgres`. Sem Docker: `systemctl status postgresql`                   |
| `401 Não autenticado` ao baixar documento                                 | Token expirado (`JWT_EXPIRES_IN`) — faça login de novo                                                                                               | Confirmar no navegador que a sessão ainda está ativa                                                                           |
| `526 Invalid SSL certificate` (com proxy Cloudflare ativo)                | Certificado do Nginx expirado/inválido                                                                                                               | `sudo certbot certificates`, `sudo nginx -t`                                                                                   |
| Certbot falha o desafio HTTP-01                                           | Registro DNS ainda em "Proxied" (laranja) durante a emissão inicial                                                                                  | Volte para "DNS only" (cinza) só durante a emissão, depois pode voltar a "Proxied"                                             |
| Upload de planilha grande falha com 413                                   | `client_max_body_size` do Nginx menor que o arquivo                                                                                                  | Aumentar em `/etc/nginx/sites-available/financ`                                                                        |
| `CURSO: Required` em todas as linhas da importação                        | Cabeçalho da coluna na planilha não bate com `CURSO`/`NOME_CURSO` (ver `docs/PENDENCIAS.md`)                                                         | Confirmar o nome exato da coluna no arquivo `.xlsx`                                                                            |
| `Environment variable not found: DATABASE_URL` (Prisma, Rota B)           | `.env` está na raiz do projeto, mas o comando foi rodado dentro de `apps/api/` — Prisma/dotenv procuram `.env` relativo ao diretório atual           | Criar o link `ln -s ../../.env /opt/ethos-financial/apps/api/.env` (passo B.5) e rodar de novo                                 |
| `error TS5033: ... EACCES: permission denied` no `npm run build` (Rota B) | Algum arquivo/pasta (ex.: `dist/` de um build anterior) ficou com dono `root` — geralmente por um `sudo` rodado dentro do projeto no meio do caminho | `sudo chown -R SEU_USUARIO:SEU_USUARIO /opt/ethos-financial` e rodar o build de novo (passo B.4)                               |
