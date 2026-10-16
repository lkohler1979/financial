## O que muda

<!-- Resumo em 2-3 linhas: o problema e a solução. -->

## Como validar

<!-- Passo a passo para o revisor conferir (telas, endpoints, números esperados). -->

## Checklist

- [ ] A branch segue o padrão `tipo/NN-descricao-curta`
- [ ] Lint, formatação e testes passam (o CI confirma)
- [ ] Teste novo ou atualizado para o que mudou
- [ ] Se há migration: foi gerada pelo Prisma, não edita migration já aplicada e é compatível com o código antigo (o deploy faz backup antes, mas o banco não tem rollback)
- [ ] Se mexe em dinheiro, cobrança ou NFS-e: valores e arredondamentos conferidos
- [ ] Sem segredos, senhas ou dados reais de alunos no código ou nos testes
