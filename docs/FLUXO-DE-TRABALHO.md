# Fluxo de trabalho (Git, CI e deploy)

Toda mudança entra pela `main` **só por Pull Request**, e a `main` é o que está em produção.

```
branch nova ──push──▶ PR aberto ──▶ CI valida ──▶ revisão (2ª pessoa) ──▶ merge (squash)
                                                                              │
                          produção ◀── deploy ◀── CI na main ◀── push na main ◀┘
```

## 1. Branch

Uma branch por mudança, a partir da `main` atualizada, no padrão **`tipo/NN-descricao-curta`**:

| Parte             | Regra                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| `tipo`            | `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci` ou `hotfix`           |
| `NN`              | número sequencial (12, 13, 14…) — veja o último com `git branch -a` ou nos PRs |
| `descricao-curta` | minúsculas, sem acento, separadas por hífen                                    |

Exemplos: `feat/12-dashboard-visao-geral`, `fix/13-importacao-sem-cpf`.
O CI recusa o PR se o nome não seguir o padrão.

```bash
git switch main && git pull
git switch -c feat/12-dashboard-visao-geral
```

## 2. Pull Request e CI

Ao dar push e abrir o PR, o CI (`.github/workflows/main.yml`) roda: nome da branch, lint, Prettier,
testes da API e build da API e do front. **Não existe ambiente de homologação** — a validação é o CI
verde + a revisão. Corrija o que falhar com novos commits na mesma branch.

Antes de abrir o PR, rode local o mesmo que o CI:

```bash
npm run lint && npm run format:check && npm run test:api
```

## 3. Revisão

- É exigida **1 aprovação** de outra pessoa (o GitHub não deixa aprovar o próprio PR).
- Novo commit na branch descarta a aprovação anterior.
- Todos os comentários precisam estar resolvidos.

## 4. Merge e deploy

O merge é feito pelo botão do PR, **squash**, e a branch é apagada. Ninguém faz push direto na `main`.
O push na `main` roda o CI de novo e, passando, o job `deploy` publica em produção
(`scripts/deploy.sh` na VPS): atualiza o código, instala, builda, **faz backup do banco**, aplica
migrations, builda o front, reinicia o PM2 e confere o **health check** da API — se a API não responder,
o deploy falha e o GitHub avisa.

Backups ficam em `/opt/ethos-backups` na VPS (os 10 últimos).

## 5. Correção urgente (hotfix)

Mesmo caminho, só mais curto: `hotfix/NN-descricao`, PR pequeno e revisão imediata. Não há atalho para a
`main`; se for emergência real, um administrador pode desligar temporariamente a proteção em
Settings → Branches e religar em seguida.

## 6. Voltar atrás

- **Código:** abra um PR de _revert_ (`git revert <commit>`); ele passa pelo mesmo fluxo.
- **Banco:** migrations não têm rollback. Restaure o backup de `/opt/ethos-backups`
  (`pg_restore --clean --if-exists -d <banco> <arquivo>`) e depois volte o código.

## Configuração do repositório (já aplicada)

- `main` protegida: PR obrigatório, 1 aprovação, aprovação descartada em novo commit, conversas
  resolvidas, checks `branch-name` e `lint-and-test` obrigatórios e branch atualizada com a `main`.
- Só merge por squash; branches apagadas após o merge.
- Ambiente `production` para os deploys.
- Segredos de deploy: `DEPLOY_HOST`, `DEPLOY_USER` e `DEPLOY_SSH_KEY` (ou `DEPLOY_PASSWORD`).
