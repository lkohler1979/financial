-- Sincroniza o catálogo de situações de cobrança com o conjunto oficial
-- validado em produção. Usa os mesmos UUIDs já existentes no VPS, e
-- ON CONFLICT (nome) para ser idempotente: se o nome já existir (produção),
-- só atualiza cor/ordem; se não existir (outros ambientes), insere com o
-- mesmo id de produção.
INSERT INTO situacoes_cobranca (id, nome, cor, ordem, ativa, participa_novos_relatorios)
VALUES
  ('233c4547-35c3-401f-bd7c-547ee5ce810a', 'PENDENTE', '#FAEEDA', 10, true, true),
  ('73821209-16d9-4895-9a97-7265ef75352b', 'ADIMPLENTE', '#27AE60', 10, true, false),
  ('2d1f7b1f-5d16-4353-a18b-a1370244e12e', 'MENSAGEM DE PRÉ-PROTESTO ENVIADA', '#E67E22', 91, true, false),
  ('40529853-2438-4cef-89e5-9957aba7357f', 'PROTESTO ENVIADO', '#C0392B', 92, true, false),
  ('db0abb77-9197-41c4-82a5-674534b881fa', 'PROTESTADO', '#A32D2D', 93, true, false),
  ('4c93a889-bcc8-4e49-99db-b0c68e44fe15', 'PROTESTO DEVOLVIDO', '#7F8C8D', 94, true, false),
  ('bd728854-1137-48d6-828c-68ff32392ef0', 'QUITADO', '#2ECC71', 95, true, false)
ON CONFLICT (nome) DO UPDATE SET
  cor = EXCLUDED.cor,
  ordem = EXCLUDED.ordem,
  ativa = EXCLUDED.ativa,
  participa_novos_relatorios = EXCLUDED.participa_novos_relatorios;
