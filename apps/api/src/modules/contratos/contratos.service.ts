import { ClicksignAutenticacao, Prisma } from "@prisma/client";
import { armazenamento } from "../../shared/armazenamento/armazenamento";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/app-error";
import { decifrar } from "../../shared/utils/criptografia";
import { validarCpf } from "../../shared/utils/cpf";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { ClicksignClient, type AuthClicksign } from "./clicksign-client";
import { ehDocx, preencherModeloDocx } from "./contrato-modelo";
import { contratosRepository } from "./contratos.repository";
import { verificarAssinaturaWebhook } from "./clicksign-webhook";

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PASTA_MODELO = "contratos/modelo";
const PASTA_CONTRATOS = "contratos";

const AUTH: Record<ClicksignAutenticacao, AuthClicksign> = {
  EMAIL: "email",
  SMS: "sms",
  WHATSAPP: "whatsapp",
  ICP_BRASIL: "icp_brasil",
};

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const digitos = (v?: string | null) => (v ?? "").replace(/\D/g, "");
const data = (d?: Date | null) =>
  d
    ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
    : "";
const moeda = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function cpfFormatado(cpf: string): string {
  const d = digitos(cpf);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpf;
}

function cpfCnpjFormatado(valor: string): string {
  const d = digitos(valor);
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    : cpfFormatado(d);
}

function enderecoCompleto(p: {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
}): string {
  return [
    [p.endereco, p.numero].filter(Boolean).join(", "),
    p.complemento,
    p.bairro,
    [p.cidade, p.estado].filter(Boolean).join("/"),
    p.cep ? `CEP ${p.cep}` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

/** Quem assina: o sacado pessoa física, se houver; senão o próprio aluno. */
function definirContratante(matricula: DadosMatricula) {
  const { aluno, sacado } = matricula;
  if (sacado && sacado.tipoPessoa === "FISICA") {
    return {
      nome: sacado.nome,
      documento: sacado.cpfCnpj,
      email: sacado.email,
      telefone: sacado.telefone,
      nascimento: sacado.dataNascimento,
      endereco: enderecoCompleto(sacado),
    };
  }
  return {
    nome: aluno.nome,
    documento: aluno.cpf,
    email: aluno.email,
    telefone: aluno.telefone1,
    nascimento: aluno.dataNascimento,
    endereco: enderecoCompleto(aluno),
  };
}

type DadosMatricula = NonNullable<
  Awaited<ReturnType<typeof contratosRepository.matriculaCompleta>>
>;

function montarValores(
  matricula: DadosMatricula,
  config: Awaited<ReturnType<typeof configuracoesRepository.obterOuCriar>>,
): Record<string, string> {
  const { aluno, curso, parcelas } = matricula;
  const contratante = definirContratante(matricula);
  const hoje = new Date();
  const primeira = parcelas[0];
  return {
    NOMEALUNO: aluno.nome,
    CPF: cpfFormatado(aluno.cpf),
    RG: aluno.numeroDocumentoIdentificacao ?? "",
    DATANASCIMENTO: data(aluno.dataNascimento),
    EMAIL: aluno.email ?? "",
    TELEFONE: aluno.telefone1 ?? "",
    ENDERECO: enderecoCompleto(aluno),
    CEP: aluno.cep ?? "",
    BAIRRO: aluno.bairro ?? "",
    CIDADE: aluno.cidade ?? "",
    ESTADO: aluno.estado ?? "",
    NOMECONTRATANTE: contratante.nome,
    CPFCNPJCONTRATANTE: cpfCnpjFormatado(contratante.documento),
    EMAILCONTRATANTE: contratante.email ?? "",
    ENDERECOCONTRATANTE: contratante.endereco,
    CURSO: curso.nome,
    CODIGOCURSO: curso.codigo,
    NUMEROMATRICULA: matricula.numeroMatricula ?? "",
    DATAMATRICULA: data(matricula.dataMatricula),
    VALORCURSO: moeda(matricula.valorCurso),
    NUMEROPARCELAS: matricula.numeroParcelas != null ? String(matricula.numeroParcelas) : "",
    VALORPARCELA: moeda(primeira?.valor),
    DIAVENCIMENTO: matricula.diaVencimento != null ? String(matricula.diaVencimento) : "",
    PRIMEIROVENCIMENTO: data(primeira?.vencimento),
    DATAATUAL: data(hoje),
    DATAATUALEXTENSO: `${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`,
    NOMEESCOLA: config.clicksignEscolaNome ?? "",
    CNPJESCOLA: config.nfsePrestadorCnpj ? cpfCnpjFormatado(config.nfsePrestadorCnpj) : "",
  };
}

async function lerModelo(
  config: Awaited<ReturnType<typeof configuracoesRepository.obterOuCriar>>,
): Promise<Buffer> {
  if (!config.contratoModeloChave) {
    throw new ValidationError(
      "Nenhum modelo de contrato foi enviado. Envie o arquivo .docx em Configurações.",
    );
  }
  const fs = await import("node:fs");
  try {
    return await fs.promises.readFile(armazenamento.caminho(config.contratoModeloChave));
  } catch {
    throw new ValidationError(
      "O arquivo do modelo de contrato não foi encontrado. Envie-o de novo.",
    );
  }
}

async function gerarDocx(matriculaId: string) {
  const matricula = await contratosRepository.matriculaCompleta(matriculaId);
  if (!matricula) throw new NotFoundError("Matrícula não encontrada");
  const config = await configuracoesRepository.obterOuCriar();
  const modelo = await lerModelo(config);
  const resultado = await preencherModeloDocx(modelo, montarValores(matricula, config));
  return { matricula, config, ...resultado };
}

function nomeArquivo(aluno: string, curso: string): string {
  const limpo = `Contrato ${aluno} ${curso}`.replace(/[^\p{L}\p{N} _-]/gu, "").trim();
  return `${limpo.slice(0, 120)}.docx`;
}

function clienteClicksign(
  config: Awaited<ReturnType<typeof configuracoesRepository.obterOuCriar>>,
): ClicksignClient {
  if (!config.clicksignTokenCriptografado) {
    throw new ValidationError("Informe o token da Clicksign em Configurações.");
  }
  return new ClicksignClient(
    decifrar(config.clicksignTokenCriptografado),
    config.clicksignAmbiente,
  );
}

export const contratosService = {
  /** Modelo: grava o .docx enviado em Configurações. */
  async salvarModelo(arquivo: Buffer, nomeOriginal: string, usuarioId: string) {
    if (!/\.docx$/i.test(nomeOriginal) || !(await ehDocx(arquivo))) {
      throw new ValidationError("O modelo precisa ser um arquivo do Word (.docx).");
    }
    const config = await configuracoesRepository.obterOuCriar();
    const chave = await armazenamento.salvar(PASTA_MODELO, nomeOriginal, arquivo);
    await configuracoesRepository.atualizar({
      contratoModeloChave: chave,
      contratoModeloNome: nomeOriginal,
    });
    if (config.contratoModeloChave) await armazenamento.remover(config.contratoModeloChave);
    await registrarAuditoria({
      usuarioId,
      entidade: "Configuracao",
      entidadeId: config.id,
      acao: "ATUALIZACAO",
      detalhes: { camposAlterados: ["contratoModelo"], arquivo: nomeOriginal },
    });
    return { nome: nomeOriginal };
  },

  async baixarModelo() {
    const config = await configuracoesRepository.obterOuCriar();
    if (!config.contratoModeloChave) throw new NotFoundError("Nenhum modelo enviado");
    return {
      caminho: armazenamento.caminho(config.contratoModeloChave),
      nome: config.contratoModeloNome ?? "modelo-contrato.docx",
    };
  },

  /** Gera o contrato preenchido (sem enviar) para conferência. */
  async gerarPrevia(matriculaId: string) {
    const { matricula, arquivo, naoEncontrados } = await gerarDocx(matriculaId);
    return {
      arquivo,
      nome: nomeArquivo(matricula.aluno.nome, matricula.curso.nome),
      naoEncontrados,
    };
  },

  async enviar(matriculaId: string, usuarioId: string) {
    const existente = await contratosRepository.ultimoDaMatricula(matriculaId);
    if (existente && existente.status === "ENVIADO") {
      throw new ConflictError(
        "Já existe um contrato aguardando assinatura. Cancele-o antes de enviar outro.",
      );
    }

    const { matricula, config, arquivo } = await gerarDocx(matriculaId);
    const contratante = definirContratante(matricula);
    const cliente = clienteClicksign(config);
    const auth = AUTH[config.clicksignAutenticacao];

    const email = contratante.email?.trim();
    if (!email)
      throw new ValidationError(`Cadastre o e-mail de ${contratante.nome} para enviar o contrato.`);
    if (!validarCpf(contratante.documento))
      throw new ValidationError(`CPF de ${contratante.nome} inválido ou ausente.`);
    if (contratante.nome.trim().split(/\s+/).length < 2)
      throw new ValidationError("A Clicksign exige nome e sobrenome do signatário.");
    const telefone = digitos(contratante.telefone);
    if ((auth === "sms" || auth === "whatsapp") && telefone.length < 10)
      throw new ValidationError(
        `Cadastre o telefone de ${contratante.nome} (autenticação por ${auth}).`,
      );

    const nome = nomeArquivo(matricula.aluno.nome, matricula.curso.nome);
    const chaveGerado = await armazenamento.salvar(PASTA_CONTRATOS, nome, arquivo);

    let envelopeId: string | null = null;
    try {
      envelopeId = await cliente.criarEnvelope(`Contrato - ${matricula.aluno.nome}`);
      const documentoId = await cliente.adicionarDocumento(envelopeId, nome, arquivo, MIME_DOCX);

      const signatarioId = await cliente.adicionarSignatario(envelopeId, {
        nome: contratante.nome,
        email,
        cpf: cpfFormatado(contratante.documento),
        telefone: telefone || undefined,
        nascimento: contratante.nascimento?.toISOString().slice(0, 10),
      });
      await cliente.adicionarRequisitos(envelopeId, documentoId, signatarioId, auth);

      // Representante da escola assina também, se estiver configurado. Sem telefone cadastrado,
      // a autenticação dele é por e-mail (ou ICP-Brasil, quando for o método escolhido).
      if (
        config.clicksignEscolaNome &&
        config.clicksignEscolaEmail &&
        validarCpf(config.clicksignEscolaCpf ?? "")
      ) {
        const escolaId = await cliente.adicionarSignatario(envelopeId, {
          nome: config.clicksignEscolaNome,
          email: config.clicksignEscolaEmail,
          cpf: cpfFormatado(config.clicksignEscolaCpf as string),
        });
        await cliente.adicionarRequisitos(
          envelopeId,
          documentoId,
          escolaId,
          auth === "icp_brasil" ? "icp_brasil" : "email",
        );
      }

      await cliente.ativarEnvelope(envelopeId);

      const contrato = await contratosRepository.criar({
        matriculaId,
        envelopeId,
        documentoClicksignId: documentoId,
        contratanteNome: contratante.nome,
        contratanteEmail: email,
        autenticacao: config.clicksignAutenticacao,
        arquivoGeradoChave: chaveGerado,
        enviadoPorId: usuarioId,
      });
      await registrarAuditoria({
        usuarioId,
        entidade: "ContratoMatricula",
        entidadeId: contrato.id,
        acao: "CRIACAO",
        detalhes: { matriculaId, envelopeId, autenticacao: config.clicksignAutenticacao },
      });
      return contrato;
    } catch (erro) {
      await armazenamento.remover(chaveGerado);
      // Tenta não deixar envelope órfão na Clicksign.
      if (envelopeId) await cliente.cancelarEnvelope(envelopeId).catch(() => undefined);
      throw erro;
    }
  },

  async obterDaMatricula(matriculaId: string) {
    return contratosRepository.ultimoDaMatricula(matriculaId);
  },

  async cancelar(matriculaId: string, usuarioId: string) {
    const contrato = await contratosRepository.ultimoDaMatricula(matriculaId);
    if (!contrato || contrato.status !== "ENVIADO")
      throw new NotFoundError("Não há contrato aguardando assinatura");
    if (contrato.envelopeId) {
      const config = await configuracoesRepository.obterOuCriar();
      await clienteClicksign(config).cancelarEnvelope(contrato.envelopeId);
    }
    await contratosRepository.atualizar(contrato.id, { status: "CANCELADO" });
    await registrarAuditoria({
      usuarioId,
      entidade: "ContratoMatricula",
      entidadeId: contrato.id,
      acao: "ATUALIZACAO",
      detalhes: { status: "CANCELADO" },
    });
  },

  async arquivo(matriculaId: string, tipo: "gerado" | "assinado") {
    const contrato = await contratosRepository.ultimoDaMatricula(matriculaId);
    const chave =
      tipo === "assinado" ? contrato?.arquivoAssinadoChave : contrato?.arquivoGeradoChave;
    if (!contrato || !chave) throw new NotFoundError("Arquivo do contrato não encontrado");
    return {
      caminho: armazenamento.caminho(chave),
      nome: tipo === "assinado" ? "contrato-assinado.pdf" : "contrato.docx",
      mime: tipo === "assinado" ? "application/pdf" : MIME_DOCX,
    };
  },

  /** Busca o PDF assinado na Clicksign e marca o contrato como assinado. */
  async sincronizarAssinado(contratoId: string) {
    const contrato = await contratosRepository.porId(contratoId);
    if (!contrato || !contrato.envelopeId || !contrato.documentoClicksignId)
      throw new NotFoundError("Contrato não encontrado");
    const config = await configuracoesRepository.obterOuCriar();
    const pdf = await clienteClicksign(config).baixarAssinado(
      contrato.envelopeId,
      contrato.documentoClicksignId,
    );
    const chave = pdf
      ? await armazenamento.salvar(PASTA_CONTRATOS, "contrato-assinado.pdf", pdf)
      : null;
    if (!pdf) console.warn("[clicksign] arquivo assinado ainda indisponível", contratoId);
    await contratosRepository.marcarAssinado(contrato, chave);
    return contratosRepository.porId(contratoId);
  },

  async sincronizarDaMatricula(matriculaId: string) {
    const contrato = await contratosRepository.ultimoDaMatricula(matriculaId);
    if (!contrato) throw new NotFoundError("Esta matrícula não tem contrato enviado");
    return this.sincronizarAssinado(contrato.id);
  },

  /**
   * Webhook da Clicksign (rota pública). Valida o HMAC-SHA256 do corpo bruto com o segredo
   * configurado; eventos que não interessam são aceitos e ignorados.
   */
  async processarWebhook(corpoBruto: Buffer, assinatura: string | undefined, payload: unknown) {
    const config = await configuracoesRepository.obterOuCriar();
    if (!config.clicksignHmacCriptografado)
      throw new AppError("Webhook da Clicksign não configurado", 401, "NAO_AUTORIZADO");
    if (
      !verificarAssinaturaWebhook(
        corpoBruto,
        assinatura,
        decifrar(config.clicksignHmacCriptografado),
      )
    )
      throw new AppError("Assinatura do webhook inválida", 401, "NAO_AUTORIZADO");

    const evento = (payload as { event?: { name?: string } })?.event?.name;
    if (!evento || !["document_closed", "refusal", "cancel"].includes(evento)) return;

    const contrato = await contratosRepository.porIdentificadores(coletarTextos(payload));
    if (!contrato || contrato.status !== "ENVIADO") return;

    if (evento === "document_closed") {
      await this.sincronizarAssinado(contrato.id);
    } else {
      await contratosRepository.atualizar(contrato.id, {
        status: evento === "refusal" ? "RECUSADO" : "CANCELADO",
      });
    }
  },
};

/** Todos os textos do payload — o id do envelope/documento aparece em lugares diferentes por evento. */
function coletarTextos(valor: unknown, acc: string[] = []): string[] {
  if (typeof valor === "string") acc.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => coletarTextos(v, acc));
  else if (valor && typeof valor === "object")
    Object.values(valor).forEach((v) => coletarTextos(v, acc));
  return acc;
}
