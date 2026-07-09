# EthosFinancial 1.0

Sistema web de gestão de alunos, cursos, matrículas, financeiro e cobrança de inadimplência, com geração automática de documentos de protesto.

## Documentação

- [`CLAUDE.md`](./CLAUDE.md) — guia para agentes de codificação trabalharem neste repositório
- [`docs/PRD.md`](./docs/PRD.md) — especificação de produto (resumo em markdown)
- [`docs/especificacao/`](./docs/especificacao/) — especificação formal completa (.docx)
- [`docs/TASK.md`](./docs/TASK.md) — plano de tarefas por sprint
- [`docs/PENDENCIAS.md`](./docs/PENDENCIAS.md) — decisões em aberto e riscos

## Stack

Node.js 20 + Express 5 + TypeScript · Angular 17+ · PostgreSQL 16 · Prisma ORM · BullMQ + Redis · Docker.

## Como rodar

```bash
cp .env.example .env
docker compose up -d
```

- API: http://localhost:3000
- Web: http://localhost:4200
- Adminer (opcional): `docker compose --profile tools up -d adminer` → http://localhost:8081

Veja detalhes de desenvolvimento local (sem Docker) em [`CLAUDE.md`](./CLAUDE.md#5-como-rodar-o-projeto-localmente).
