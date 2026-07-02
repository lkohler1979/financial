# PRD — EthosFinancial 1.0

> Versão markdown de referência rápida para desenvolvimento. O documento formal e completo (com diagramas e formatação) está em `docs/especificacao/EthosFinancial_1.0_Especificacao.docx`. Em caso de divergência, o `.docx` é a fonte oficial; este arquivo deve ser mantido sincronizado com ele.

## 1. Visão Geral e Proposta de Valor

O EthosFinancial é uma plataforma web de gestão acadêmico-financeira para instituições de ensino, com foco em automatizar a identificação de alunos inadimplentes e conduzir o ciclo de cobrança (contato, negociação, protesto) de forma rastreável.

**Problema resolvido:** hoje o controle é feito em planilhas dispersas, sem histórico de tratativas, sem rastreabilidade e com geração manual de documentos de protesto.

**Proposta de valor:**
- Elimina o retrabalho manual de identificar inadimplentes a cada ciclo;
- Transforma a cobrança em um fluxo de CRM (situações, TAGs, histórico, ações em lote);
- Gera automaticamente os documentos de protesto no padrão jurídico da instituição;
- Permite comunicação automatizada/assistida por IA via WhatsApp (Evolution API + Groq/Ollama);
- Garante auditoria completa e histórico imutável;
- Escala via processamento assíncrono (filas).

## 2. Objetivo

Importar periodicamente (semanal ou mensal) uma planilha financeira no padrão já utilizado pela instituição, manter cadastro de alunos/cursos/matrículas/parcelas, e gerar relatórios individuais de inadimplência em Word para cobrança/protesto. **O CPF é a chave principal do aluno.**

## 3. Objetivos do Produto

- Cadastro único de aluno por CPF, com múltiplas matrículas e múltiplos cursos;
- Importação periódica com atualização incremental (nunca destrutiva);
- Detecção de inadimplência configurável;
- Geração automática de documento Word;
- Histórico de importações e auditoria completa;
- Módulo de gestão de cobranças (CRM).

## 4. Stack Tecnológico

**Backend:** Node.js 20, Express 5, TypeScript, Prisma ORM, PostgreSQL 16, BullMQ + Redis 7, JWT + bcrypt, Zod, biblioteca `docx`.

**Frontend:** Angular 17+ (Standalone), Angular Material/Tailwind, ngx-charts/Chart.js, RxJS + Signals, Reactive Forms.

**Comunicação/IA:** Evolution API v2 (WhatsApp), Groq API (nuvem, ex. Llama 3.1) ou Ollama (LLM local) — configurável via `AI_PROVIDER`.

**Infra:** Docker + Docker Compose, Nginx (produção do frontend), CI/CD (GitHub Actions/GitLab CI sugerido).

## 5. Perfis de Usuário

- **Administrador:** acesso total (importar, cadastrar cursos/usuários, editar tudo, configurar, gerar relatórios).
- **Operador:** importar planilhas, consultar, gerar relatórios, registrar cobrança. Não altera configurações.

## 6. Arquitetura Funcional (módulos)

Dashboard · Cadastro de Alunos · Cadastro de Cursos · Matrículas · Financeiro · Importação · Relatórios · Gestão de Cobranças (Situações/TAGs/Histórico) · Configurações · Auditoria.

## 7. Cadastro de Alunos

Chave: **CPF**. Campos: Identificação (CPF, Nome, Tipo Pessoa, Data Cadastro), Contato (email, tel1, tel2), Endereço (CEP, endereço, número, complemento, bairro, cidade, estado). Reimportação com CPF existente **atualiza** dados e **preserva histórico**.

## 8. Cadastro de Cursos

Cadastro próprio (a planilha só tem o nome). Campos: ID interno, Código (editável), Nome, Situação, Observações. Na importação: curso inexistente → criar automaticamente **ou** deixar pendente (configurável).

## 9. Matrículas

Vínculo Aluno ↔ Curso ↔ Parcelas. Campos: Aluno, Curso, Número da matrícula (editável), Data da matrícula, Contrato assinado, Situação, Observações.

## 10. Financeiro (Parcelas)

Campos: Código do Título, Parcela, Data de Vencimento, Valor, Tipo do Título, Status, Data de Pagamento, Valor Pago, Observações.

**Status:** `EM_ABERTO` · `PAGO` · `CANCELADO` · `PROTESTADO` · `RENEGOCIADO`.

## 11. Importação

Formato: Excel (.xlsx). Colunas: `DATA_MATRICULA, TP_PESSOA, CNPJ_CPF, NOME, ENDEREÇO, EMAIL, FONE, CONTRATO ASSINADO, COD_TITULO, PARCELA, DT_VENCIMENTO, VALOR, TIPO_TITULO, CURSO`.

Fluxo: Upload → Pré-validação → Leitura → Validação CPF → Aluno existe? (atualiza/cria) → Curso existe? (associa/cria ou pendente) → Cria/atualiza Matrícula → Importa Parcelas → Resumo.

## 12. Regras de Atualização

Parcela identificada por `(Matrícula, Código do Título)`. Existe → atualiza. Não existe → insere. **Jamais excluir registros antigos.**

## 13. Configurações do Sistema

- Frequência de importação: Manual / Semanal / Mensal
- Quantidade mínima de parcelas vencidas (padrão: 3)
- Dias de atraso mínimo (opcional: 15/30/60)
- Pasta de saída dos documentos (configurável)
- Modelo Word (arquivo .docx selecionável)
- Padrão de nome de arquivo: `{NOME}_{CPF}_{CURSO}.docx`

## 14. Dashboard

Indicadores: total de alunos/cursos/matrículas, parcelas vencidas, valor total vencido, alunos inadimplentes, relatórios gerados, última importação. Gráficos: inadimplência por curso, inadimplência mensal, valor vencido por mês, evolução histórica.

## 15. Relatório de Inadimplência

Gerado após cada importação, para alunos que atendem às regras configuradas (mínimo de parcelas vencidas / dias de atraso). Dados: CPF, Nome, Curso, parcelas vencidas, valor bruto, multa, juros, total, total devedor consolidado.

## 16. Geração Automática de Word

Documento por aluno elegível, no layout "Planilha para Protesto de Contrato": credor, CNPJ, devedor, CPF, curso, tabela de parcelas, total consolidado, data de emissão, assinatura. Deve seguir fielmente o modelo jurídico já validado.

## 17. Histórico de Importações

Registrar: usuário, data, arquivo, total de registros, novos alunos, alunos atualizados, parcelas novas/atualizadas, erros.

## 18. Auditoria

Registrar: edição de aluno, alteração de matrícula/parcela, alteração de configuração, geração de relatório, execução de importações.

## 19. Requisitos Não Funcionais

**Performance:**
- API simples: ≤ 300ms p95; relatórios/listagens filtradas: ≤ 1,5s p95;
- Importação de 10k registros: assíncrona, sem bloquear UI;
- Geração de Word: ≤ 3s/documento, em lote assíncrono;
- SPA: carregamento inicial ≤ 2,5s em 4G;
- Disponibilidade alvo: ≥ 99,5%.

**Segurança:**
- JWT com expiração + refresh token; senhas com bcrypt/argon2;
- RBAC em todas as rotas; HTTPS/TLS obrigatório;
- Mitigação OWASP Top 10 (Prisma evita SQL injection; sanitização de XSS; CSRF em formulários; rate limiting em rotas públicas/auth);
- LGPD: tratamento de CPF/telefone/e-mail com trilha de auditoria de acesso;
- Segredos apenas via variáveis de ambiente; backups criptografados.

**Acessibilidade:**
- WCAG 2.1 nível AA nas telas administrativas;
- Contraste adequado; navegação completa via teclado; atributos ARIA;
- Indicadores de cor (ex.: situação de cobrança) sempre acompanhados de rótulo textual.

## 20. Modelo de Dados (Entidades)

`Usuario, Aluno, Curso, Matricula, Parcela, Importacao, Configuracao, SituacaoCobranca, Tag, MatriculaTag, HistoricoCobranca, ObservacaoCobranca, Auditoria` — ver `apps/api/prisma/schema.prisma` para o schema completo e autoritativo.

## 21. Fluxo Completo

Upload → Leitura → Localiza CPF → Atualiza/Cria Aluno → Localiza Curso → Atualiza/Cria Matrícula → Importa Parcelas → Calcula Inadimplência → Aplica Regras → Seleciona Elegíveis → Gera Word → Salva na Pasta Configurada → Disponibiliza Download/Histórico.

## 22. Melhorias Recomendadas (backlog futuro)

Templates Word parametrizáveis; agendamento por watch folder; versionamento de importações; painel de inconsistências; notificações por e-mail; exportação em lote (ZIP); API de integração com ERPs.

## 23. Módulo de Gestão de Cobranças

### 23.1 Situação da Cobrança
Cadastro configurável (Nome, Cor, Ordem, Ativa, Descrição, `participaNovosRelatorios`). Exemplos: Pendente, Em contato, Aguardando retorno, Promessa de pagamento, Quitado, Enviado para Protesto, Enviado para Jurídico, Renegociado.

### 23.2 TAGs
Cadastro livre, N:N com Matrícula. Exemplos: Alto Valor, Prioridade, WhatsApp, Jurídico, Bolsa, Convênio, Ex-aluno, Desistente, Cobrança 2026.

### 23.3 Histórico da Cobrança
Toda alteração de situação/TAG/observação gera registro imutável (data, usuário, ação).

### 23.4 Geração do Relatório — Filtros
Financeiros (parcelas mínimas, dias de atraso, valor min/max, curso, tipo de título) · Aluno (CPF, nome, cidade, estado) · Matrícula (curso, data, contrato, situação) · Cobrança (situação, TAG, possui/não possui TAG, incluir/excluir situações).

### 23.5 Atualização em Lote
Após gerar relatório: alterar situação, inserir/remover TAG, adicionar observação, marcar como exportado/protestado/contatado — para todos os selecionados.

### 23.6 Regras para Próximos Relatórios
Checkbox para ignorar situações já tratadas (ex.: Quitado, Protestado, Jurídico) na próxima geração.

### 23.7 Observações da Cobrança
Linha do tempo de observações por matrícula.

### 23.8 Dashboard da Cobrança
Inadimplentes, valor em aberto, quantidade por situação/TAG, valor em protesto/renegociado/quitado, relatórios por período, top 10 cursos, ranking de TAGs.

### 23.9 Campanhas de Cobrança (evolução futura)
Substituir "relatório" por "Campanha" (ex.: "Protesto Julho/2026"), com métricas por campanha e rastreabilidade completa.

## 24. Arquitetura do Projeto e Estrutura de Pastas

Ver árvore completa em `CLAUDE.md` e no `docker-compose.yml`. Resumo: monorepo com `apps/api` (backend), `apps/web` (frontend), `packages/shared-types` (DTOs), `docs/` (este PRD, TASK, PENDENCIAS e especificação formal).

## 25. Docker e Ambiente de Desenvolvimento

Serviços: `postgres`, `redis`, `evolution-api`, `ollama` (opcional, profile `ia-local`), `api`, `worker`, `web`, `adminer` (opcional, profile `tools`). Subir tudo: `docker compose up -d`.

## 26. Roadmap de Releases (sugestão)

| Release | Escopo |
|---|---|
| 1.0 | Cadastros, Importação, Financeiro, Relatório de Inadimplência, Geração de Word, Configurações, Auditoria |
| 1.1 | Módulo de Gestão de Cobranças completo (Situações, TAGs, Histórico, Filtros, Lote) |
| 1.2 | Dashboard de Cobrança e indicadores avançados |
| 2.0 | Campanhas de Cobrança, watch folder, notificações por e-mail, API de integração com ERPs |
