import path from "node:path";
import type { StatusSolicitacao } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/app-error";
import { armazenamento } from "../../shared/armazenamento/armazenamento";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { solicitacoesRepository } from "./solicitacoes.repository";
import type {
  AtualizarTipoSolicitacaoInput,
  CriarTipoSolicitacaoInput,
} from "./solicitacoes.schema";

const ENTIDADE = "SolicitacaoDocumento";
const EXTENSOES_PERMITIDAS = [".pdf", ".jpg", ".jpeg", ".png"];

export interface ArquivoSolicitacao {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

async function exigir(id: string) {
  const solicitacao = await solicitacoesRepository.findById(id);
  if (!solicitacao) throw new NotFoundError("Solicitação não encontrada");
  return solicitacao;
}

export const solicitacoesService = {
  listarTipos(incluirInativos = false) {
    return solicitacoesRepository.listarTipos(incluirInativos);
  },

  async criarTipo(input: CriarTipoSolicitacaoInput, usuarioId: string) {
    if (await solicitacoesRepository.findTipoPorNome(input.nome)) {
      throw new ConflictError("Já existe um tipo de solicitação com este nome", { nome: input.nome });
    }
    const tipo = await solicitacoesRepository.criarTipo(input);
    await registrarAuditoria({
      usuarioId,
      entidade: "TipoSolicitacao",
      entidadeId: tipo.id,
      acao: "CRIACAO",
      detalhes: { nome: tipo.nome },
    });
    return tipo;
  },

  async atualizarTipo(id: string, input: AtualizarTipoSolicitacaoInput, usuarioId: string) {
    const atual = await solicitacoesRepository.findTipo(id);
    if (!atual) throw new NotFoundError("Tipo de solicitação não encontrado");
    if (
      input.nome &&
      input.nome !== atual.nome &&
      (await solicitacoesRepository.findTipoPorNome(input.nome))
    ) {
      throw new ConflictError("Já existe um tipo de solicitação com este nome", { nome: input.nome });
    }
    const tipo = await solicitacoesRepository.atualizarTipo(id, input);
    await registrarAuditoria({
      usuarioId,
      entidade: "TipoSolicitacao",
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: Object.keys(input) },
    });
    return tipo;
  },

  /** Pedido do aluno (área do aluno). Não duplica um pedido ainda aberto do
   * mesmo tipo para a mesma matrícula. */
  async criar(
    alunoId: string,
    input: { tipoSolicitacaoId: string; matriculaId?: string | null; observacao?: string | null },
  ) {
    const tipo = await solicitacoesRepository.findTipo(input.tipoSolicitacaoId);
    if (!tipo || !tipo.ativo) throw new NotFoundError("Tipo de solicitação não encontrado");

    const matriculaId = input.matriculaId ?? null;
    if ((await solicitacoesRepository.contarAbertasDoTipo(tipo.id, alunoId, matriculaId)) > 0) {
      throw new ConflictError("Você já tem uma solicitação em aberto para este documento");
    }
    return solicitacoesRepository.criar({
      tipoSolicitacaoId: tipo.id,
      alunoId,
      matriculaId,
      observacaoAluno: input.observacao || null,
    });
  },

  listarDoAluno(alunoId: string) {
    return solicitacoesRepository.listarDoAluno(alunoId);
  },

  listar(status?: StatusSolicitacao) {
    return solicitacoesRepository.listar(status);
  },

  /** Atende o pedido anexando o arquivo para o aluno baixar. */
  async atender(
    id: string,
    arquivo: ArquivoSolicitacao | undefined,
    resposta: string | undefined,
    usuarioId: string,
  ) {
    const solicitacao = await exigir(id);
    if (solicitacao.status !== "ABERTA") {
      throw new ValidationError("Esta solicitação já foi finalizada");
    }
    if (!arquivo) throw new ValidationError("Anexe o documento para o aluno");
    if (!EXTENSOES_PERMITIDAS.includes(path.extname(arquivo.originalname).toLowerCase())) {
      throw new ValidationError("Formato inválido — envie PDF, JPG ou PNG");
    }

    const chave = await armazenamento.salvar(
      `solicitacoes/${solicitacao.alunoId}`,
      arquivo.originalname,
      arquivo.buffer,
    );
    const atualizada = await solicitacoesRepository.update(id, {
      status: "ATENDIDA",
      arquivoNome: arquivo.originalname,
      arquivoChave: chave,
      arquivoMime: arquivo.mimetype,
      arquivoTamanho: arquivo.size,
      respostaStaff: resposta || null,
      atendidoPorId: usuarioId,
      atendidoEm: new Date(),
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { acao: "atendida", tipo: solicitacao.tipo.nome, arquivo: arquivo.originalname },
    });
    return atualizada;
  },

  async recusar(id: string, motivo: string, usuarioId: string) {
    const solicitacao = await exigir(id);
    if (solicitacao.status !== "ABERTA") {
      throw new ValidationError("Esta solicitação já foi finalizada");
    }
    const atualizada = await solicitacoesRepository.update(id, {
      status: "RECUSADA",
      respostaStaff: motivo,
      atendidoPorId: usuarioId,
      atendidoEm: new Date(),
    });
    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: id,
      acao: "ATUALIZACAO",
      detalhes: { acao: "recusada", tipo: solicitacao.tipo.nome, motivo },
    });
    return atualizada;
  },

  async obterArquivo(id: string) {
    const solicitacao = await exigir(id);
    if (!solicitacao.arquivoChave) {
      throw new NotFoundError("Esta solicitação não tem arquivo anexado");
    }
    return {
      caminho: armazenamento.caminho(solicitacao.arquivoChave),
      nome: solicitacao.arquivoNome ?? "documento",
      mime: solicitacao.arquivoMime ?? "application/octet-stream",
    };
  },

  async obterArquivoDoAluno(id: string, alunoId: string) {
    const solicitacao = await exigir(id);
    // Mesma resposta para "não existe" e "é de outro aluno".
    if (solicitacao.alunoId !== alunoId) throw new NotFoundError("Solicitação não encontrada");
    return this.obterArquivo(id);
  },
};
