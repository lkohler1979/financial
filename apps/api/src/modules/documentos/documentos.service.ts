import path from "node:path";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { armazenamento } from "../../shared/armazenamento/armazenamento";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { documentosRepository } from "./documentos.repository";
import type { AtualizarDocumentoInput } from "./documentos.schema";

const ENTIDADE = "Documento";
const EXTENSOES_PERMITIDAS = [".pdf", ".jpg", ".jpeg", ".png"];

export interface ArquivoEnviado {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

async function podeDeferir(usuarioId: string): Promise<boolean> {
  const usuario = await documentosRepository.findUsuario(usuarioId);
  return !!usuario && (usuario.perfil === "ADMINISTRADOR" || usuario.podeDeferirDocumentos);
}

/** Documentos de escopo ALUNO ficam sem matrícula (valem pra todas as dele). */
async function carregarContexto(matriculaId: string, tipoDocumentoId: string) {
  const matricula = await documentosRepository.findMatricula(matriculaId);
  if (!matricula) throw new NotFoundError("Matrícula não encontrada");
  const tipo = await documentosRepository.findTipo(tipoDocumentoId);
  if (!tipo || !tipo.ativo) throw new NotFoundError("Tipo de documento não encontrado");
  const matriculaDoDocumento = tipo.escopo === "MATRICULA" ? matricula.id : null;
  return { matricula, tipo, matriculaDoDocumento };
}

async function obterOuCriar(matriculaId: string, tipoDocumentoId: string) {
  const { matricula, matriculaDoDocumento } = await carregarContexto(matriculaId, tipoDocumentoId);
  const existente = await documentosRepository.findPorTipo(
    tipoDocumentoId,
    matricula.alunoId,
    matriculaDoDocumento,
  );
  if (existente) return existente;
  return documentosRepository.create({
    tipoDocumentoId,
    alunoId: matricula.alunoId,
    matriculaId: matriculaDoDocumento,
  });
}

export const documentosService = {
  async listarTipos() {
    return documentosRepository.listarTiposAtivos();
  },

  /** Um item por tipo de documento (com o documento já criado, ou null). */
  async listarDaMatricula(matriculaId: string, usuarioId: string) {
    const matricula = await documentosRepository.findMatricula(matriculaId);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");

    const [tipos, documentos] = await Promise.all([
      documentosRepository.listarTiposAtivos(),
      documentosRepository.listarDaMatricula(matriculaId, matricula.alunoId),
    ]);

    const itens = tipos.map((tipo) => ({
      tipo,
      documento:
        documentos.find(
          (d) =>
            d.tipoDocumentoId === tipo.id &&
            (tipo.escopo === "MATRICULA" ? d.matriculaId === matriculaId : d.matriculaId === null),
        ) ?? null,
    }));

    const pendentesObrigatorios = itens.filter(
      (i) =>
        i.tipo.obrigatorio &&
        !(
          i.documento?.situacaoEntrega === "ENVIADO" &&
          i.documento.situacaoDeferimento === "DEFERIDO"
        ),
    ).length;

    return { podeDeferir: await podeDeferir(usuarioId), pendentesObrigatorios, itens };
  },

  async anexarArquivo(
    matriculaId: string,
    tipoDocumentoId: string,
    arquivo: ArquivoEnviado | undefined,
    usuarioId: string,
  ) {
    if (!arquivo) throw new ValidationError("Selecione um arquivo para enviar");
    if (!EXTENSOES_PERMITIDAS.includes(path.extname(arquivo.originalname).toLowerCase())) {
      throw new ValidationError("Formato inválido — envie PDF, JPG ou PNG");
    }

    const documento = await obterOuCriar(matriculaId, tipoDocumentoId);
    const chave = await armazenamento.salvar(documento.alunoId, arquivo.originalname, arquivo.buffer);
    if (documento.arquivoChave) await armazenamento.remover(documento.arquivoChave);

    // Novo arquivo sempre volta a conferência pro início — o deferimento
    // anterior valia pro arquivo antigo.
    const atualizado = await documentosRepository.update(documento.id, {
      arquivoNome: arquivo.originalname,
      arquivoChave: chave,
      arquivoMime: arquivo.mimetype,
      arquivoTamanho: arquivo.size,
      situacaoEntrega: "ENVIADO",
      anexadoEm: new Date(),
      situacaoDeferimento: "PENDENTE",
      deferidoEm: null,
      validadoPorId: null,
    });

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: documento.id,
      acao: "ATUALIZACAO",
      detalhes: { acao: "arquivo_anexado", tipo: documento.tipo.nome, arquivo: arquivo.originalname },
    });
    return atualizado;
  },

  async atualizar(
    matriculaId: string,
    tipoDocumentoId: string,
    input: AtualizarDocumentoInput,
    usuarioId: string,
  ) {
    const documento = await obterOuCriar(matriculaId, tipoDocumentoId);
    const dados: Record<string, unknown> = {};

    if (input.vencimento !== undefined) dados.vencimento = input.vencimento;
    if (input.observacaoInterna !== undefined) dados.observacaoInterna = input.observacaoInterna;
    if (input.observacaoAluno !== undefined) dados.observacaoAluno = input.observacaoAluno;

    const entregaFinal = input.situacaoEntrega ?? documento.situacaoEntrega;
    if (input.situacaoEntrega !== undefined) {
      dados.situacaoEntrega = input.situacaoEntrega;
      // Voltar pra "não enviado" invalida uma conferência que já tinha sido feita.
      if (input.situacaoEntrega === "NAO_ENVIADO" && documento.situacaoDeferimento !== "PENDENTE") {
        dados.situacaoDeferimento = "PENDENTE";
        dados.deferidoEm = null;
        dados.validadoPorId = null;
      }
    }

    if (
      input.situacaoDeferimento !== undefined &&
      input.situacaoDeferimento !== documento.situacaoDeferimento
    ) {
      if (!(await podeDeferir(usuarioId))) {
        throw new AppError("Você não tem permissão para deferir documentos", 403, "SEM_PERMISSAO");
      }
      if (input.situacaoDeferimento !== "PENDENTE" && entregaFinal !== "ENVIADO") {
        throw new ValidationError("Só é possível deferir/indeferir um documento já enviado");
      }
      dados.situacaoDeferimento = input.situacaoDeferimento;
      dados.deferidoEm = input.situacaoDeferimento === "PENDENTE" ? null : new Date();
      dados.validadoPorId = input.situacaoDeferimento === "PENDENTE" ? null : usuarioId;
    }

    const atualizado = await documentosRepository.update(documento.id, dados);

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: documento.id,
      acao: "ATUALIZACAO",
      detalhes: { tipo: documento.tipo.nome, camposAlterados: Object.keys(input) },
    });
    return atualizado;
  },

  async removerArquivo(documentoId: string, usuarioId: string) {
    const documento = await documentosRepository.findById(documentoId);
    if (!documento) throw new NotFoundError("Documento não encontrado");
    if (documento.arquivoChave) await armazenamento.remover(documento.arquivoChave);

    const atualizado = await documentosRepository.update(documentoId, {
      arquivoNome: null,
      arquivoChave: null,
      arquivoMime: null,
      arquivoTamanho: null,
      anexadoEm: null,
      situacaoEntrega: "NAO_ENVIADO",
      situacaoDeferimento: "PENDENTE",
      deferidoEm: null,
      validadoPorId: null,
    });

    await registrarAuditoria({
      usuarioId,
      entidade: ENTIDADE,
      entidadeId: documentoId,
      acao: "ATUALIZACAO",
      detalhes: { acao: "arquivo_removido", tipo: documento.tipo.nome },
    });
    return atualizado;
  },

  async obterArquivo(documentoId: string) {
    const documento = await documentosRepository.findById(documentoId);
    if (!documento?.arquivoChave || !documento.arquivoNome) {
      throw new NotFoundError("Este documento não tem arquivo anexado");
    }
    return {
      caminho: armazenamento.caminho(documento.arquivoChave),
      nome: documento.arquivoNome,
      mime: documento.arquivoMime ?? "application/octet-stream",
    };
  },
};
