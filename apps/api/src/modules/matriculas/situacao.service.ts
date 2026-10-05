import { NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { buscarSituacao, SITUACOES_MATRICULA } from "./situacao-matricula";
import { situacaoRepository } from "./situacao.repository";

export interface AlterarSituacaoInput {
  situacao: string;
  periodoLetivo?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
}

export const situacaoService = {
  listarSituacoes() {
    return SITUACOES_MATRICULA;
  },

  async listarHistorico(matriculaId: string) {
    if (!(await situacaoRepository.findMatricula(matriculaId))) {
      throw new NotFoundError("Matrícula não encontrada");
    }
    return situacaoRepository.listarHistorico(matriculaId);
  },

  /** Troca manual pela equipe: situação válida, diferente da atual e, nas que
   * encerram/suspendem o vínculo, com motivo. */
  async alterar(matriculaId: string, input: AlterarSituacaoInput, usuarioId: string) {
    const matricula = await situacaoRepository.findMatricula(matriculaId);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");

    const nova = buscarSituacao(input.situacao);
    if (!nova) throw new ValidationError("Situação inválida");
    if (matricula.situacao === nova.codigo) {
      throw new ValidationError("A matrícula já está nesta situação");
    }
    if (nova.exigeMotivo && !input.motivo?.trim()) {
      throw new ValidationError(`Informe o motivo para a situação "${nova.nome}"`);
    }

    await situacaoRepository.trocar(matriculaId, {
      situacaoAnterior: matricula.situacao,
      situacaoNova: nova.codigo,
      periodoLetivo: input.periodoLetivo?.trim() || null,
      motivo: input.motivo?.trim() || null,
      observacoes: input.observacoes?.trim() || null,
      usuarioId,
    });
    await registrarAuditoria({
      usuarioId,
      entidade: "Matricula",
      entidadeId: matriculaId,
      acao: "ATUALIZACAO",
      detalhes: { acao: "situacao_alterada", de: matricula.situacao, para: nova.codigo },
    });
    return { situacao: nova.codigo };
  },

  /** Registro da situação inicial (matrícula nova), ainda sem anterior. */
  registrarInicial(matriculaId: string, situacao: string, usuarioId: string | null) {
    return situacaoRepository.registrarInicial(matriculaId, situacao, usuarioId);
  },

  /**
   * Primeiro pagamento confirmado tira a matrícula de "Aguardando pagamento".
   * Só age nessa situação — nunca reativa uma matrícula trancada/cancelada.
   * Melhor esforço: falha aqui não pode impedir o registro do pagamento.
   */
  async ativarPorPagamento(matriculaId: string): Promise<boolean> {
    try {
      const matricula = await situacaoRepository.findMatricula(matriculaId);
      if (matricula?.situacao !== "AGUARDANDO_PAGAMENTO") return false;
      await situacaoRepository.trocar(matriculaId, {
        situacaoAnterior: "AGUARDANDO_PAGAMENTO",
        situacaoNova: "ATIVA",
        motivo: "Pagamento confirmado",
        usuarioId: null,
      });
      return true;
    } catch (erro) {
      console.error("[situacao] falha ao ativar matrícula por pagamento", erro);
      return false;
    }
  },
};
