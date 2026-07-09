import { registrarAuditoria } from "../auditoria/auditoria.service";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { mapeamentoImportacaoRepository } from "./mapeamento-importacao.repository";
import { CAMPOS_POR_TABELA, campoValido } from "./mapeamento-importacao.constants";
import type {
  AtualizarMapeamentoInput,
  CriarMapeamentoInput,
} from "./mapeamento-importacao.schema";

const ENTIDADE = "MapeamentoImportacao";

export const mapeamentoImportacaoService = {
  camposDisponiveis() {
    return CAMPOS_POR_TABELA;
  },

  listar() {
    return mapeamentoImportacaoRepository.listarOuSemear();
  },

  async criar(input: CriarMapeamentoInput, usuarioId: string) {
    const existente = await mapeamentoImportacaoRepository.findByColuna(input.colunaPlanilha);
    if (existente) {
      throw new ConflictError(`Já existe um mapeamento para a coluna "${input.colunaPlanilha}"`);
    }

    const mapeamento = await mapeamentoImportacaoRepository.create({
      colunaPlanilha: input.colunaPlanilha,
      tabelaDestino: input.tabelaDestino,
      campoDestino: input.campoDestino,
      acaoAusente: input.acaoAusente,
      valorPadrao: input.acaoAusente === "VALOR_PADRAO" ? input.valorPadrao : undefined,
      ativo: input.ativo ?? true,
    });

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: mapeamento.id,
      acao: "CRIACAO",
      detalhes: { colunaPlanilha: mapeamento.colunaPlanilha },
    });

    return mapeamento;
  },

  async atualizar(id: string, input: AtualizarMapeamentoInput, usuarioId: string) {
    const atual = await mapeamentoImportacaoRepository.findById(id);
    if (!atual) throw new NotFoundError("Mapeamento não encontrado");

    const tabelaDestino = input.tabelaDestino ?? atual.tabelaDestino;
    const campoDestino = input.campoDestino ?? atual.campoDestino;
    if (!campoValido(tabelaDestino, campoDestino)) {
      throw new ValidationError(`Campo "${campoDestino}" não é configurável para a tabela ${tabelaDestino}`);
    }

    if (input.colunaPlanilha && input.colunaPlanilha !== atual.colunaPlanilha) {
      const duplicado = await mapeamentoImportacaoRepository.findByColuna(input.colunaPlanilha);
      if (duplicado) {
        throw new ConflictError(`Já existe um mapeamento para a coluna "${input.colunaPlanilha}"`);
      }
    }

    const acaoAusente = input.acaoAusente ?? atual.acaoAusente;
    const mapeamento = await mapeamentoImportacaoRepository.update(id, {
      ...(input.colunaPlanilha !== undefined ? { colunaPlanilha: input.colunaPlanilha } : {}),
      ...(input.tabelaDestino !== undefined ? { tabelaDestino: input.tabelaDestino } : {}),
      ...(input.campoDestino !== undefined ? { campoDestino: input.campoDestino } : {}),
      ...(input.acaoAusente !== undefined ? { acaoAusente: input.acaoAusente } : {}),
      valorPadrao: acaoAusente === "VALOR_PADRAO" ? (input.valorPadrao ?? atual.valorPadrao) : null,
      ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
    });

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });

    return mapeamento;
  },

  async remover(id: string, usuarioId: string) {
    const atual = await mapeamentoImportacaoRepository.findById(id);
    if (!atual) throw new NotFoundError("Mapeamento não encontrado");

    await mapeamentoImportacaoRepository.delete(id);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "EXCLUSAO",
      detalhes: { colunaPlanilha: atual.colunaPlanilha },
    });
  },
};
