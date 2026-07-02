# CLAUDE.md

Guia de contexto para o Claude (ou qualquer agente de codificação) trabalhar neste repositório. Leia este arquivo antes de propor ou aplicar qualquer alteração de código.

## 1. O que é este projeto

**EthosFinancial 1.0** — sistema web de gestão de alunos, cursos, matrículas, financeiro e cobrança de inadimplência para instituições de ensino, com geração automática de documentos de protesto em Word e comunicação de cobrança via WhatsApp assistida por IA.

A especificação completa do produto está em `docs/especificacao/EthosFinancial_1.0_Especificacao.docx` e resumida em `docs/PRD.md`. **Sempre consulte o PRD antes de implementar uma funcionalidade nova** — não invente regras de negócio que não estejam lá; se precisar de uma decisão que não está especificada, registre em `docs/PENDENCIAS.md` em vez de assumir.

## 2. Stack tecnológico (não alterar sem justificativa explícita)

| Camada                        | Tecnologia                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| Backend runtime               | Node.js 20                                                         |
| Framework HTTP                | Express 5                                                          |
| Linguagem                     | TypeScript (strict mode)                                           |
| ORM                           | Prisma ORM                                                         |
| Banco de dados                | PostgreSQL 16                                                      |
| Filas / background jobs       | BullMQ + Redis 7                                                   |
| Frontend                      | Angular 17+ (Standalone Components)                                |
| UI                            | Angular Material + Tailwind                                        |
| WhatsApp                      | Evolution API v2                                                   |
| IA para mensagens de cobrança | Groq API (nuvem) ou Ollama (local), configurável via `AI_PROVIDER` |
| Geração de documentos         | biblioteca `docx` (Node)                                           |
| Containerização               | Docker + Docker Compose                                            |

## 3. Estrutura do monorepo

```
ethos-financial/
├── apps/api/         # Backend — módulos de negócio em src/modules/*
├── apps/web/         # Frontend Angular — features em src/app/features/*
├── packages/shared-types/  # DTOs TypeScript compartilhados entre api e web
├── docker/           # configs auxiliares de containers
├── docs/             # PRD.md, TASK.md, PENDENCIAS.md, especificação completa
└── docker-compose.yml
```

Cada módulo de negócio (`alunos`, `cursos`, `matriculas`, `financeiro`, `importacao`, `cobranca`, `relatorios`, `configuracoes`, `auditoria`, `auth`, `notificacoes`, `ia`) deve ser autocontido: controller, service, repository (Prisma), DTOs e testes vivem juntos dentro de `apps/api/src/modules/<nome>/`.

## 4. Convenções de código

- **TypeScript strict** em todo o projeto — não desabilitar `strict` no `tsconfig.json`.
- Nomes de arquivos e pastas em `kebab-case`; classes em `PascalCase`; variáveis/funções em `camelCase`.
- Todo endpoint da API deve validar o payload de entrada com **Zod** antes de tocar no banco.
- Toda alteração em Aluno, Matrícula, Parcela ou Configuração deve gerar um registro em `Auditoria` (ver seção 18 do PRD).
- Toda alteração de Situação de Cobrança ou TAG em uma Matrícula deve gerar um registro em `HistoricoCobranca` (nunca apagar histórico).
- Regras de negócio (ex.: quantidade mínima de parcelas vencidas) nunca devem ser hardcoded — sempre ler de `Configuracao`.
- Operações pesadas (importação de planilha, geração de Word, envio de WhatsApp) **sempre** via fila BullMQ, nunca de forma síncrona numa requisição HTTP.
- Nunca commitar segredos — usar `.env` (baseado em `.env.example`), nunca hardcode de chaves de API.

## 5. Como rodar o projeto localmente

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis evolution-api
npm run prisma:migrate --workspace=apps/api
npm run dev:api
npm run dev:worker
npm run dev:web
```

Ou tudo via Docker:

```bash
docker compose up -d
```

Para usar IA local (Ollama) em vez do Groq:

```bash
docker compose --profile ia-local up -d
# e definir AI_PROVIDER=ollama no .env
```

## 6. Testes

- Testes unitários e de integração da API em `apps/api/tests/`, executados com `npm run test --workspace=apps/api` (Vitest).
- Toda nova regra de negócio deve vir acompanhada de teste — especialmente as regras de elegibilidade de inadimplência (seção 15/23 do PRD) e as regras de atualização de importação (seção 12).

## 7. Fluxo de trabalho esperado do agente

1. Antes de codificar, verificar `docs/PRD.md` e `docs/TASK.md` para confirmar que a tarefa está no escopo e entender critérios de aceite.
2. Se a tarefa não estiver clara ou depender de uma decisão de produto não definida, adicionar o ponto em `docs/PENDENCIAS.md` e sinalizar ao usuário em vez de assumir.
3. Implementar seguindo a estrutura de módulos e convenções acima.
4. Atualizar `docs/TASK.md` marcando o item como concluído (ou em andamento) ao final do trabalho.
5. Nunca remover histórico de auditoria/cobrança ou excluir parcelas/matrículas antigas — o sistema é append-first nesses domínios (ver seção 12 do PRD: "jamais excluir registros antigos").

## 8. O que este agente NÃO deve fazer

- Não alterar o layout do documento Word de protesto sem confirmação — ele segue um modelo jurídico já validado pela instituição.
- Não remover o registro de auditoria/histórico de nenhuma entidade.
- Não processar importação ou geração de documentos de forma síncrona/bloqueante.
- Não introduzir novas dependências de stack (outro banco, outro ORM, outro framework de fila) sem alinhamento explícito — a stack está fixada na seção 2 deste arquivo e na seção 4 do PRD.
