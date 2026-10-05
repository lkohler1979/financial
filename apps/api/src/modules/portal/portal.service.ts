import { AppError, NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { normalizarCpf } from "../../shared/utils/cpf";
import { gerarTokenAluno } from "../../shared/utils/jwt";
import { asaasService } from "../asaas/asaas.service";
import type { AsaasBillingType } from "../asaas/asaas-client";
import { documentosService, type ArquivoEnviado } from "../documentos/documentos.service";
import { tiposCobrancaService } from "../tipos-cobranca/tipos-cobranca.service";
import { solicitacoesService } from "../solicitacoes/solicitacoes.service";
import { portalRepository, type SessaoPortal } from "./portal.repository";
import type { LoginPortalInput, SolicitarDocumentoInput } from "./portal.schema";

const CREDENCIAIS_INVALIDAS = "Dados de acesso inválidos";

// Limite de tentativas de login por CPF e por IP — o login é só CPF + data de
// nascimento (dados pouco secretos), então travamos força bruta. Em memória:
// reinicia com o processo, suficiente para uma única instância da API.
const MAX_FALHAS_CPF = 5;
// Por IP o limite é maior: atrás de proxy reverso todos podem compartilhar o mesmo IP.
const MAX_FALHAS_IP = 30;
const JANELA_MS = 15 * 60 * 1000;
const falhas = new Map<string, { quantidade: number; desde: number }>();

function bloqueado(chave: string, agora: number, maximo: number): boolean {
  const f = falhas.get(chave);
  if (!f) return false;
  if (agora - f.desde > JANELA_MS) {
    falhas.delete(chave);
    return false;
  }
  return f.quantidade >= maximo;
}

function registrarFalha(chave: string, agora: number) {
  const f = falhas.get(chave);
  if (!f || agora - f.desde > JANELA_MS) falhas.set(chave, { quantidade: 1, desde: agora });
  else f.quantidade += 1;
}

/** Compara "YYYY-MM-DD" com a data de nascimento — a coluna pode ter sido
 * gravada como meia-noite em UTC ou no fuso local (importações x cadastro). */
function mesmaData(nascimento: Date | null, informada: string): boolean {
  if (!nascimento) return false;
  const utc = nascimento.toISOString().slice(0, 10);
  const local = [
    nascimento.getFullYear(),
    String(nascimento.getMonth() + 1).padStart(2, "0"),
    String(nascimento.getDate()).padStart(2, "0"),
  ].join("-");
  return informada === utc || informada === local;
}

export function limparLimitesLogin() {
  falhas.clear();
}

export const portalService = {
  /**
   * Acesso à área do aluno:
   * - CPF + data de nascimento → aluno (vê tudo dele) ou, se o CPF for de um
   *   sacado pessoa física, o sacado (vê só os títulos que paga);
   * - CNPJ + número de uma matrícula que a empresa paga → sacado.
   * Mensagem de erro igual para qualquer falha (não revela se o documento existe).
   */
  async login(
    { documento, dataNascimento, numeroMatricula }: LoginPortalInput,
    ip: string,
    agora = Date.now(),
  ) {
    const digitos = normalizarCpf(documento);
    const chaveDoc = `doc:${digitos}`;
    const chaveIp = `ip:${ip}`;
    if (bloqueado(chaveDoc, agora, MAX_FALHAS_CPF) || bloqueado(chaveIp, agora, MAX_FALHAS_IP)) {
      throw new AppError(
        "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        429,
        "MUITAS_TENTATIVAS",
      );
    }

    const acesso = await this.autenticar(digitos, dataNascimento, numeroMatricula);
    if (!acesso) {
      registrarFalha(chaveDoc, agora);
      registrarFalha(chaveIp, agora);
      throw new AppError(CREDENCIAIS_INVALIDAS, 401, "CREDENCIAIS_INVALIDAS");
    }

    falhas.delete(chaveDoc);
    return {
      token: gerarTokenAluno({ sub: acesso.id, nome: acesso.nome, tipo: acesso.tipo }),
      tipoAcesso: acesso.tipo,
      aluno: { id: acesso.id, codigo: acesso.codigo, nome: acesso.nome },
    };
  },

  async autenticar(digitos: string, dataNascimento?: string, numeroMatricula?: string) {
    if (digitos.length === 11 && dataNascimento) {
      const aluno = await portalRepository.findAlunoPorCpf(digitos);
      if (aluno && mesmaData(aluno.dataNascimento, dataNascimento)) {
        return { tipo: "ALUNO" as const, id: aluno.id, nome: aluno.nome, codigo: aluno.codigo };
      }
      const sacado = await portalRepository.findSacadoPorDocumento(digitos);
      if (sacado && mesmaData(sacado.dataNascimento, dataNascimento)) {
        return { tipo: "SACADO" as const, id: sacado.id, nome: sacado.nome, codigo: null };
      }
    }
    if (digitos.length === 14 && numeroMatricula) {
      const sacado = await portalRepository.findSacadoPorDocumento(digitos);
      if (
        sacado &&
        (await portalRepository.findMatriculaDoSacadoPorNumero(sacado.id, numeroMatricula.trim()))
      ) {
        return { tipo: "SACADO" as const, id: sacado.id, nome: sacado.nome, codigo: null };
      }
    }
    return null;
  },

  async me(sessao: SessaoPortal) {
    const matriculas = await portalRepository.listarMatriculas(sessao);
    if (sessao.sacadoId) {
      const sacado = await portalRepository.findSacado(sessao.sacadoId);
      if (!sacado) throw new NotFoundError("Sacado não encontrado");
      return { tipoAcesso: "SACADO" as const, aluno: { ...sacado, codigo: null, cpf: sacado.cpfCnpj }, matriculas };
    }
    const aluno = await portalRepository.findAluno(sessao.alunoId as string);
    if (!aluno) throw new NotFoundError("Aluno não encontrado");
    return { tipoAcesso: "ALUNO" as const, aluno, matriculas };
  },

  // ---- Documentos ----

  /** Mesma lista da secretaria, só com os campos que o aluno pode ver (sem
   * observação interna nem quem deferiu). */
  async listarDocumentos(alunoId: string, matriculaId: string) {
    await this.exigirMatricula(alunoId, matriculaId);
    const { itens, pendentesObrigatorios } = await documentosService.listarDaMatricula(
      matriculaId,
      alunoId,
    );
    return {
      pendentesObrigatorios,
      itens: itens.map(({ tipo, documento }) => ({
        tipo: { id: tipo.id, nome: tipo.nome, escopo: tipo.escopo, obrigatorio: tipo.obrigatorio },
        documento: documento && {
          id: documento.id,
          situacaoEntrega: documento.situacaoEntrega,
          situacaoDeferimento: documento.situacaoDeferimento,
          arquivoNome: documento.arquivoNome,
          anexadoEm: documento.anexadoEm,
          observacaoAluno: documento.observacaoAluno,
        },
      })),
    };
  },

  async enviarDocumento(
    alunoId: string,
    matriculaId: string,
    tipoId: string,
    arquivo: ArquivoEnviado | undefined,
    ip?: string,
  ) {
    await this.exigirMatricula(alunoId, matriculaId);
    const { itens } = await documentosService.listarDaMatricula(matriculaId, alunoId);
    const item = itens.find((i) => i.tipo.id === tipoId);
    if (!item) throw new NotFoundError("Tipo de documento não encontrado");
    // Documento já aprovado não é substituído pelo aluno — a secretaria
    // precisa reabrir (voltar o deferimento) antes.
    if (item.documento?.situacaoDeferimento === "DEFERIDO") {
      throw new ValidationError("Este documento já foi aprovado e não pode ser substituído");
    }
    const documento = await documentosService.anexarArquivo(matriculaId, tipoId, arquivo, null, ip);
    return {
      id: documento.id,
      situacaoEntrega: documento.situacaoEntrega,
      situacaoDeferimento: documento.situacaoDeferimento,
    };
  },

  async baixarDocumento(alunoId: string, documentoId: string) {
    const documento = await portalRepository.findDocumentoDoAluno(documentoId, alunoId);
    if (!documento) throw new NotFoundError("Documento não encontrado");
    return documentosService.obterArquivo(documentoId);
  },

  // ---- Pagamentos ----

  listarParcelas(sessao: SessaoPortal) {
    return portalRepository.listarParcelas(sessao);
  },

  /** Formas de pagamento habilitadas em Configurações. */
  formasPagamento() {
    return tiposCobrancaService.formasPagamentoHabilitadas();
  },

  /** Emite (ou devolve, se já emitida) a cobrança de uma parcela em aberto. */
  async gerarCobranca(sessao: SessaoPortal, parcelaId: string, forma?: AsaasBillingType) {
    const parcela = await portalRepository.findParcelaDoDono(parcelaId, sessao);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    if (parcela.status !== "EM_ABERTO") {
      throw new ValidationError("Só é possível emitir cobrança de parcelas em aberto");
    }
    const billingType = forma ?? parcela.formaPagamento ?? "BOLETO";
    return asaasService.gerarCobrancaParcela(parcelaId, billingType, null);
  },

  // ---- Solicitações ----

  listarTiposSolicitacao() {
    return solicitacoesService.listarTipos(false);
  },

  listarSolicitacoes(alunoId: string) {
    return solicitacoesService.listarDoAluno(alunoId);
  },

  async solicitar(alunoId: string, input: SolicitarDocumentoInput) {
    if (input.matriculaId) await this.exigirMatricula(alunoId, input.matriculaId);
    return solicitacoesService.criar(alunoId, input);
  },

  baixarSolicitacao(alunoId: string, solicitacaoId: string) {
    return solicitacoesService.obterArquivoDoAluno(solicitacaoId, alunoId);
  },

  async exigirMatricula(alunoId: string, matriculaId: string) {
    const matricula = await portalRepository.findMatriculaDoAluno(matriculaId, alunoId);
    if (!matricula) throw new NotFoundError("Matrícula não encontrada");
  },
};
