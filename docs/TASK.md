# TASK.md — EthosFinancial 1.0

Quadro de tarefas de engenharia. Convenção de status: `[ ]` a fazer · `[~]` em andamento · `[x]` concluído · `[!]` bloqueado (ver `PENDENCIAS.md`).

Ao concluir uma tarefa, marque o checkbox e, se relevante, adicione uma linha curta de nota (data/decisão). Não apague tarefas — se uma tarefa deixar de fazer sentido, marque como `[x] ~~cancelada~~: motivo`.

---

## Sprint 0 — Fundação do Projeto

- [x] Estrutura de monorepo (apps/api, apps/web, packages/shared-types)
- [x] `docker-compose.yml` com postgres, redis, evolution-api, ollama (opcional), api, worker, web, adminer
- [x] `.env.example` com todas as variáveis necessárias
- [x] `schema.prisma` inicial com as entidades do modelo de dados
- [x] Configurar ESLint + Prettier no monorepo (api e web) — 2026-07-02: flat config (`eslint.config.mjs`) na raiz cobrindo api e web + Prettier; regras Angular-específicas (`@angular-eslint`) ficam para quando o app Angular real for gerado via `ng new`/`ng add @angular-eslint/schematics`.
- [x] Configurar pipeline de CI (lint + testes) no GitHub Actions/GitLab CI — 2026-07-02: `.github/workflows/ci.yml` (lint, format:check, prisma generate, test:api); repositório é local, sem remoto, então o workflow não é executado automaticamente ainda, mas os passos foram validados manualmente. Criado teste smoke `apps/api/tests/integration/health.test.ts` para o pipeline ter algo a rodar.
- [x] Rodar `docker compose up -d` e validar todos os healthchecks localmente — 2026-07-02: postgres e redis `healthy`, evolution-api respondendo HTTP 200. Portas do `.env` local ajustadas (6379→6390, 3000→3010, 4200→4210, 8080→8090, 8081→8091) por já estarem em uso pelos containers do projeto WhatFlow nesta máquina.

## Sprint 1 — Cadastros Base (Aluno, Curso, Matrícula)

- [x] Módulo `alunos`: CRUD completo (CPF como chave única) + testes — 2026-07-02: controller/service/repository/schema (Zod) em `apps/api/src/modules/alunos`; validação de CPF (dígitos verificadores) + normalização; auditoria em criação/atualização/exclusão; bloqueio de exclusão com matrículas vinculadas (append-first). Testes unitários com Prisma mockado (rodam sem banco, compatível com o CI).
- [x] Módulo `cursos`: CRUD (código editável) + testes — 2026-07-02: mesma estrutura; código único e editável (revalidação de unicidade no update); auditoria + bloqueio de exclusão com matrículas.
- [x] Módulo `matriculas`: CRUD, vínculo aluno↔curso, número de matrícula editável + testes — 2026-07-02: valida existência de aluno/curso; chave natural `(aluno, curso, número)` única; auditoria + bloqueio de exclusão com parcelas (append-first). Rotas montadas em `apps/api/src/app.ts` sob `/api/*` com error-handler central e middleware de contexto de usuário.
- [x] Tela Angular de cadastro/listagem de Alunos — 2026-07-02: app Angular 17 standalone gerado em `apps/web` (Material + Tailwind, `preflight` desligado para não conflitar com o Material; roteamento lazy; `HttpClient` com interceptor de erro → snackbar; proxy `/api` no dev via `proxy.conf.json`). Tela de alunos: lista com busca (nome/CPF), paginação, exclusão com confirmação; formulário reativo com validação de CPF (dígitos verificadores) e CPF não editável na edição.
- [x] Tela Angular de cadastro/listagem de Cursos — 2026-07-02: lista com busca e badge de situação; formulário (código editável, situação ativa/inativa, observações).
- [x] Tela Angular de cadastro/listagem de Matrículas — 2026-07-02: lista com aluno/curso/nº/data/situação; formulário com autocomplete de aluno e curso (busca server-side), situação e contrato assinado. `ng build` de produção validado (saída em `dist/ethos-financial-web/browser`, compatível com o Dockerfile/nginx). Nota: regras de lint específicas de template Angular (`@angular-eslint`) ainda não adicionadas — o `ng build` já faz a checagem de templates (`strictTemplates`); adicionar `@angular-eslint` fica como follow-up.

## Sprint 2 — Financeiro e Importação

- [x] Módulo `financeiro`: CRUD de Parcela + regra de status — 2026-07-03: `apps/api/src/modules/financeiro`; sem rota de exclusão (Parcela é append-first, PRD seção 12 — cancelamento é feito via status `CANCELADO`); status `PAGO` preenche `dataPagamento`/`valorPago` com padrão quando não informados; auditoria em criação/atualização. Testes unitários com repositórios mockados.
- [x] Módulo `importacao`: parser de planilha .xlsx (colunas definidas no PRD seção 11) — 2026-07-03: `apps/api/src/modules/importacao/importacao.parser.ts` (parse + validação Zod linha a linha, erros não interrompem o lote) e `importacao.processor.ts` (fluxo PRD seção 21: localiza/cria Aluno por CPF → localiza/cria Curso por nome → localiza/cria Matrícula (aluno+curso, planilha não traz número) → upsert de Parcela por `(matrícula, cod_titulo)`). "Curso não mapeado" resolvido como "criar automaticamente" com base no wireframe `03_importacao.html` (ver PENDENCIAS.md). Testes unitários cobrindo parser e processor com repositórios mockados.
- [~] Fila BullMQ `importacao` — worker que processa upload em background — 2026-07-03: código completo (`apps/api/src/jobs/queues/importacao.queue.ts`, `apps/api/src/jobs/workers/importacao.worker.ts`, endpoint `POST /api/importacao/upload` com multer). **Não verificado ponta a ponta**: por decisão do usuário (2026-07-03) o Redis foi removido do `docker-compose.yml` deste projeto, então não há broker local disponível agora — ver PENDENCIAS.md.
- [x] Regra de atualização incremental (matrícula + cod_titulo) sem exclusão de registros antigos — 2026-07-03: `financeiroRepository.findByChaveNatural` + `processor` nunca chama delete; parcela existente é atualizada, nunca recriada/apagada.
- [~] Tela Angular de upload de planilha + acompanhamento do progresso da importação — 2026-07-03: `apps/web/src/app/features/importacao/importacao-upload.component.ts` (drag-and-drop, polling do status do job, histórico) seguindo a estrutura do wireframe `03_importacao.html`; menu do shell (`app.component.ts`) trocado de sidenav para abas horizontais (Dashboard/Alunos/Cursos/Matrículas/Financeiro/Importação/Cobrança/Configurações — módulos ainda não implementados ficam desabilitados), conforme estrutura de navegação dos wireframes. `ng build` de produção validado (AOT/strictTemplates OK). **Não verificado visualmente no navegador** nesta sessão — a ferramenta de preview está associada ao projeto WhatFlow (diretório principal desta sessão), não ao EthosFinancial; recomenda-se validar com `npm run dev:api` + `npm run dev:web` localmente (portas 3010/4210, ver `.env`).
- [x] Registro de `Importacao` (histórico) ao final de cada processamento — 2026-07-03: worker cria o registro com as contagens (novos/atualizados/parcelas) e a lista de erros por linha; uma única `Auditoria` por importação (não por registro individual — ver PENDENCIAS.md), não por Aluno/Matrícula/Parcela tocados individualmente.

## Sprint 3 — Relatório de Inadimplência e Geração de Word

- [x] Módulo `relatorios`: cálculo de elegibilidade (parcelas mínimas / dias de atraso, via `Configuracao`) — 2026-07-03: `apps/api/src/modules/relatorios`. Regra de combinação de critérios decidida pelo usuário (ver PENDENCIAS.md): cada critério só é exigido se preenchido (>0); se os dois vierem preenchidos na mesma geração, valem juntos (E). Endpoint de prévia síncrona (`GET /elegiveis`) para revisão/seleção antes de gerar. Adicionado model `RelatorioInadimplencia` ao `schema.prisma` (não existia — necessário para o "histórico" pedido nesta tarefa; itens ficam em JSON, mesmo padrão de `Importacao.erros`). Também criado módulo `configuracoes` mínimo (só leitura/get-or-create do singleton; CRUD completo continua Sprint 5). Testes unitários com repositórios mockados.
- [~] Fila BullMQ `geracao-word` — worker de geração de documento (biblioteca `docx`) — 2026-07-03: código completo (`apps/api/src/jobs/queues/geracao-word.queue.ts`, `apps/api/src/jobs/workers/geracao-word.worker.ts`). Mesma ressalva do Sprint 2: sem Redis local (removido do compose), **não verificado ponta a ponta**.
- [x] Template Word fiel ao modelo de protesto anexado na especificação — 2026-07-03: usuário forneceu 4 documentos reais gerados pelo sistema legado (`C:\DSI\Git\CapturaMemoriaCalculo\relatorio\*.docx`). Layout de `documento-protesto.generator.ts` reconstruído para replicar exatamente a estrutura desses arquivos (título, credor/CNPJ reais, devedor, "CAMPUS/CURSO", tabela Vencimento/Valor Bruto/Multa/Juros/Total com linha de total pontilhada, data "Vitória-ES, DD/MM/AAAA.", assinatura), fonte Times New Roman 14pt, validado comparando o XML gerado com o XML dos arquivos reais (estrutura idêntica). Confirma também a regra do usuário: um documento por matrícula (aluno com 2 cursos vencidos gera 2 documentos), já era assim na implementação. Nome/CNPJ do credor atualizados para os valores reais encontrados nos exemplos. **Multa/Juros agora são configuráveis** (decisão do usuário, 2026-07-03): `Configuracao.multaPercentual` (padrão 2%), `Configuracao.jurosDiarioPercentual` (padrão 0,033% ao dia) e `Configuracao.jurosContarDiaGeracao` (conta os dias de atraso até o dia da geração do relatório, inclusive, ou só até o dia anterior) — `calculo-financeiro.ts` lê esses valores em vez de usar constantes fixas; padrões de fábrica vêm de `.env` (`MULTA_PERCENTUAL`/`JUROS_DIARIO_PERCENTUAL`/`JUROS_CONTAR_DIA_GERACAO`) na criação inicial do singleton. Ver PENDENCIAS.md.
- [x] Endpoint de download do documento gerado + gravação na pasta configurada — 2026-07-03: `GET /api/relatorios/:id/itens/:matriculaId/documento`; grava em `Configuracao.pastaSaidaDocumentos`, nome via `Configuracao.padraoNomeArquivo`.
- [~] Tela Angular de geração/listagem de relatórios de inadimplência — 2026-07-03: `apps/web/src/app/features/relatorios/` (filtros financeiros + curso, prévia de elegíveis com seleção em lote, geração, histórico + dialog de detalhes/download por item), nova aba "Relatórios" no menu. Filtros de Cobrança (situações/TAGs) do wireframe `04_relatorio_inadimplencia.html` ficam para o Sprint 4 (dependem do módulo `cobranca`). `ng build` de produção validado. **Não verificado visualmente no navegador** (mesma limitação de tooling do Sprint 2 — sessão associada ao projeto WhatFlow).

## Sprint 4 — Módulo de Gestão de Cobranças

- [x] Módulo `cobranca`: CRUD de `SituacaoCobranca` (nome, cor, ordem, ativa, participaNovosRelatorios) — 2026-07-03: `apps/api/src/modules/cobranca/situacoes.*`; nome único, bloqueio de exclusão com matrículas vinculadas. Testes unitários.
- [x] CRUD de `Tag` e associação N:N com Matrícula — 2026-07-03: `tags.*` (CRUD) + `ficha.service.ts` (associar/desassociar via `MatriculaTag`), cada alteração gera `HistoricoCobranca`. Testes unitários.
- [x] `HistoricoCobranca` — registro automático e imutável em toda alteração — 2026-07-03: `historico.repository.ts`; toda mudança de situação, tag ou observação (via `ficha.service.ts`) grava um registro; nunca editado/apagado.
- [x] `ObservacaoCobranca` — linha do tempo por matrícula — 2026-07-03: `observacoes.repository.ts` + endpoint de criação/listagem.
- [x] Tela de filtros avançados (financeiros, aluno, matrícula, cobrança) para geração de relatório — 2026-07-03: `relatorios-geracao.component.ts` ganhou os filtros de Cobrança (situação, TAG, "excluir situações já tratadas") do wireframe `04_relatorio_inadimplencia.html`. Filtros de aluno/matrícula (CPF, nome, cidade/estado, contrato) do PRD 23.4 **não** foram implementados nesta rodada — a prévia de elegíveis já parte de "quem tem parcela vencida", então esses filtros ficariam redundantes com os de Alunos/Matrículas; registrar como gap se o time achar necessário.
- [x] Ação em lote (alterar situação / TAGs / observação / marcações) sobre resultado de relatório — 2026-07-03: `POST /api/cobranca/lote` (`fichaService.aplicarEmLote`, processa cada matrícula de forma independente) + UI na tela de relatório (selects "Alterar situação"/"Inserir TAG" + botão "Aplicar" na barra de seleção). "Observação em lote" existe na API mas não tem campo dedicado na UI ainda (só situação/TAG, como no wireframe).
- [x] Regra de exclusão automática de situações já tratadas na próxima geração — 2026-07-03: filtro `ignorarSituacoesTratadas` (default `true`) em `relatorios.repository.ts`, aplicado via `SituacaoCobranca.participaNovosRelatorios`; exposto como checkbox na tela de geração.
- [x] Tela de Ficha de Cobrança (nova, além do previsto na Sprint 4) — 2026-07-03: `apps/web/src/app/features/cobranca/ficha-cobranca.component.ts`, seguindo o wireframe `05_ficha_cobranca.html` (situação, tags, parcelas em aberto, observações, histórico), acessível a partir da listagem de Matrículas e da tela de Relatórios. **Não verificada visualmente no navegador** (mesma limitação de tooling já registrada).

## Sprint 5 — Dashboard, Configurações e Auditoria

- [ ] Módulo `configuracoes`: tela única com todos os parâmetros (seção 13 do PRD)
- [ ] Dashboard geral (indicadores + gráficos, seção 14)
- [ ] Dashboard de Cobrança (indicadores específicos, seção 23.8)
- [ ] Módulo `auditoria`: interceptor/middleware que registra alterações sensíveis automaticamente
- [ ] Tela Angular de consulta de auditoria (filtros por entidade/usuário/data)

## Sprint 6 — Comunicação via WhatsApp e IA

- [ ] Módulo `notificacoes`: integração com Evolution API v2 (envio de mensagem por matrícula)
- [ ] Módulo `ia`: client abstrato `AIProvider` com implementações Groq e Ollama, alternável via `AI_PROVIDER`
- [ ] Geração de mensagem de cobrança personalizada via IA (dados: nome, curso, valor, dias de atraso)
- [ ] Fila BullMQ `whatsapp` — worker de disparo com retentativas
- [ ] Registro de envio no `HistoricoCobranca`
- [ ] Tela Angular para revisar/editar mensagem gerada por IA antes do envio (aprovação manual no MVP)

## Sprint 7 — Autenticação e Perfis

- [ ] Módulo `auth`: login, JWT + refresh token, hash de senha (bcrypt)
- [ ] Middleware de RBAC (Administrador / Operador) em todas as rotas
- [ ] Tela de login e guarda de rotas no Angular (guards + interceptors)
- [ ] Tela de gestão de usuários (somente Administrador)

## Sprint 8 — Não Funcionais e Hardening

- [ ] Rate limiting nas rotas públicas/autenticação
- [ ] Helmet, CORS restritivo, HTTPS/TLS em produção
- [ ] Auditoria de acessos a dados sensíveis (CPF, telefone, e-mail) — conformidade LGPD
- [ ] Revisão de acessibilidade WCAG 2.1 AA nas telas principais
- [ ] Testes de carga (importação de 10k registros, geração de Word em lote)
- [ ] Rotina de backup automático do PostgreSQL + política de retenção
- [ ] Documentação de runbook de produção (deploy, rollback, monitoramento)

## Backlog (pós-1.0 — ver PRD seção 22 e 26)

- [ ] Templates Word parametrizáveis pela instituição
- [ ] Agendamento automático por pasta monitorada (watch folder)
- [ ] Versionamento de importações com comparação de diferenças
- [ ] Painel de inconsistências (CPFs inválidos, cursos não mapeados, títulos duplicados)
- [ ] Notificações automáticas por e-mail
- [ ] Exportação em lote (ZIP) dos documentos gerados
- [ ] API de integração com ERPs
- [ ] Campanhas de Cobrança (substituindo o conceito de "relatório")
