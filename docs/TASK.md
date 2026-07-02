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

- [ ] Módulo `alunos`: CRUD completo (CPF como chave única) + testes
- [ ] Módulo `cursos`: CRUD (código editável) + testes
- [ ] Módulo `matriculas`: CRUD, vínculo aluno↔curso, número de matrícula editável + testes
- [ ] Tela Angular de cadastro/listagem de Alunos
- [ ] Tela Angular de cadastro/listagem de Cursos
- [ ] Tela Angular de cadastro/listagem de Matrículas

## Sprint 2 — Financeiro e Importação

- [ ] Módulo `financeiro`: CRUD de Parcela + regra de status
- [ ] Módulo `importacao`: parser de planilha .xlsx (colunas definidas no PRD seção 11)
- [ ] Fila BullMQ `importacao` — worker que processa upload em background
- [ ] Regra de atualização incremental (matrícula + cod_titulo) sem exclusão de registros antigos
- [ ] Tela Angular de upload de planilha + acompanhamento do progresso da importação
- [ ] Registro de `Importacao` (histórico) ao final de cada processamento

## Sprint 3 — Relatório de Inadimplência e Geração de Word

- [ ] Módulo `relatorios`: cálculo de elegibilidade (parcelas mínimas / dias de atraso, via `Configuracao`)
- [ ] Fila BullMQ `geracao-word` — worker de geração de documento (biblioteca `docx`)
- [ ] Template Word fiel ao modelo de protesto anexado na especificação
- [ ] Endpoint de download do documento gerado + gravação na pasta configurada
- [ ] Tela Angular de geração/listagem de relatórios de inadimplência

## Sprint 4 — Módulo de Gestão de Cobranças

- [ ] Módulo `cobranca`: CRUD de `SituacaoCobranca` (nome, cor, ordem, ativa, participaNovosRelatorios)
- [ ] CRUD de `Tag` e associação N:N com Matrícula
- [ ] `HistoricoCobranca` — registro automático e imutável em toda alteração
- [ ] `ObservacaoCobranca` — linha do tempo por matrícula
- [ ] Tela de filtros avançados (financeiros, aluno, matrícula, cobrança) para geração de relatório
- [ ] Ação em lote (alterar situação / TAGs / observação / marcações) sobre resultado de relatório
- [ ] Regra de exclusão automática de situações já tratadas na próxima geração

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
