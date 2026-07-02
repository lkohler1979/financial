# PENDENCIAS.md — EthosFinancial 1.0

Registro de decisões de produto/técnicas ainda não fechadas, riscos conhecidos e pontos que precisam de validação com o time da Ethos antes ou durante a implementação. Qualquer pessoa (ou agente) que identificar uma ambiguidade na especificação deve registrar aqui em vez de assumir uma resposta.

Convenção: `[ ]` em aberto · `[x]` resolvida (mover a decisão final para o PRD e manter a linha aqui com o resultado, para histórico).

---

## Regras de Negócio

- [ ] **Curso não mapeado na importação:** confirmar comportamento padrão de fábrica — "criar automaticamente" ou "deixar pendente"? A especificação permite ambos como configuração, mas não define o padrão inicial.
- [ ] **CPF inválido ou duplicado com dados divergentes** (ex.: mesmo CPF, nomes diferentes entre importações): qual o critério de decisão — manter o nome mais recente, o mais antigo, ou gerar alerta para revisão manual?
- [ ] **Cálculo de multa e juros:** o exemplo da planilha traz multa e juros já calculados na origem. Confirmar se o EthosFinancial deve **recalcular** esses valores (com fórmula própria) ou apenas **exibir** o que vier importado da planilha.
- [ ] **Regra de elegibilidade combinada:** quando "parcelas mínimas vencidas" (ex.: 3) e "dias de atraso" (ex.: 30 dias) estão configurados simultaneamente, a regra é E (ambas) ou OU (qualquer uma)?
- [ ] **Renegociação:** ao marcar uma parcela/matrícula como "Renegociado", o sistema deve gerar novas parcelas automaticamente ou isso fica fora do escopo do MVP (apenas mudança de status/situação)?

## Integrações Externas

- [ ] **Evolution API v2 — número de WhatsApp:** confirmar se a instituição já possui instância/número corporativo homologado, ou se a criação da instância é parte do escopo de implantação.
- [ ] **Aprovação de mensagens de IA antes do envio:** o Sprint 6 do TASK.md assume aprovação manual no MVP (humano no loop). Confirmar se isso é aceitável ou se o time deseja envio 100% automático desde o início.
- [ ] **Groq vs. Ollama — decisão de produção:** Groq depende de conectividade externa e custo por token; Ollama exige hardware local para rodar o modelo. Confirmar qual será o provedor padrão em produção antes do Sprint 6.
- [ ] **Modelo de LLM (Groq/Ollama):** confirmar qual modelo específico será usado em produção (ex.: `llama-3.1-70b-versatile` no Groq) — impacta custo e qualidade das mensagens geradas.

## Segurança e Compliance

- [ ] **LGPD — retenção de dados:** definir por quanto tempo os dados de alunos inadimplentes já quitados/protestados devem ser mantidos no sistema (política de retenção e anonimização).
- [ ] **Ambiente de produção:** confirmar onde a aplicação será hospedada (cloud própria da Ethos, provedor específico, on-premise) — impacta a configuração de TLS, backups e rede do Docker Compose (que hoje é focado em desenvolvimento/homologação).
- [ ] **Certificado/HTTPS em produção:** confirmar se haverá um reverse proxy (ex.: Traefik/Nginx com Let's Encrypt) gerenciando TLS, não coberto no `docker-compose.yml` atual (que é de desenvolvimento).

## Documento de Protesto (Word)

- [ ] **Variações de layout por curso/campus:** confirmar se todos os cursos usam o mesmo modelo de documento de protesto ou se existem variações (ex.: por unidade/campus) que exigiriam múltiplos templates.
- [ ] **Assinatura digital:** confirmar se o campo de assinatura no documento gerado deve ser apenas um espaço em branco (impressão física) ou se há necessidade futura de assinatura eletrônica integrada.

## Infraestrutura

- [ ] **Volume esperado de alunos/parcelas:** a especificação menciona suporte a "arquivos grandes (acima de 10.000 registros)" — confirmar o volume real esperado em produção para dimensionar corretamente banco, filas e workers.
- [ ] **Múltiplos ambientes:** confirmar necessidade de ambientes distintos (dev / homologação / produção) e se cada um terá sua própria instância de Evolution API (recomendado, para não misturar números de teste com produção).

## Escopo do MVP (release 1.0)

- [ ] Confirmar se o Módulo de Gestão de Cobranças (situações, TAGs, histórico) entra no MVP (release 1.0) ou fica para a 1.1, conforme sugerido no roadmap do PRD (seção 26). Isso afeta o planejamento de sprints em `TASK.md`.
- [ ] Confirmar se a comunicação via WhatsApp/IA (Sprint 6) é um requisito do MVP ou uma evolução posterior — ela não estava no escopo original solicitado pela instituição, foi incorporada a partir do stack tecnológico definido.
