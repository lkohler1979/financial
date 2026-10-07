import { NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import type { AsaasClient, AsaasNota, StatusNotaAsaas } from "../asaas/asaas-client";
import { asaasService, obterClienteAsaas } from "../asaas/asaas.service";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { criarClienteSefin, nfseNacionalService } from "./nacional/nfse-nacional.service";
import type { SefinClient } from "./nacional/sefin-client";
import { nfseRepository, TIPOS_COM_NFSE, type ParcelaParaNota } from "./nfse.repository";

/** Mês de referência (competência): `mes` de 1 a 12. */
export interface MesReferencia {
  ano: number;
  mes: number;
}

/** Quantas notas por execução — evita estourar o limite de requisições do Asaas; o resto sai na próxima. */
const LIMITE_POR_EXECUCAO = 100;

export interface TomadorNota {
  origem: "SACADO" | "ALUNO";
  id: string;
  nome: string;
  documento: string;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
}

/** Mês anterior a `hoje`. */
export function mesAnterior(hoje: Date): MesReferencia {
  return hoje.getMonth() === 0
    ? { ano: hoje.getFullYear() - 1, mes: 12 }
    : { ano: hoje.getFullYear(), mes: hoje.getMonth() };
}

/** Início (inclusive) e fim (exclusive) do mês, em horário local (TZ America/Sao_Paulo do processo). */
export function limitesDoMes({ ano, mes }: MesReferencia) {
  return { inicio: new Date(ano, mes - 1, 1), fim: new Date(ano, mes, 1) };
}

/** Competência da nota: último dia do mês de referência, como YYYY-MM-DD. */
export function competenciaDoMes({ ano, mes }: MesReferencia): string {
  const ultimo = new Date(ano, mes, 0);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${ultimo.getFullYear()}-${dois(ultimo.getMonth() + 1)}-${dois(ultimo.getDate())}`;
}

/** "AAAA-MM-DD" de uma data local. */
function dataIso(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

/** Competência padrão de um pagamento: último dia do mês pago, sem passar de hoje. */
export function competenciaPadrao(dataPagamento: Date, hoje = new Date()): string {
  const doMes = competenciaDoMes({ ano: dataPagamento.getFullYear(), mes: dataPagamento.getMonth() + 1 });
  const dataHoje = dataIso(hoje);
  return doMes > dataHoje ? dataHoje : doMes;
}

/** Quem recebe a nota: o sacado da matrícula, quando houver; senão o próprio aluno. */
export function tomadorDe(parcela: ParcelaParaNota): TomadorNota {
  const { sacado, aluno } = parcela.matricula;
  if (sacado) {
    return {
      origem: "SACADO",
      id: sacado.id,
      nome: sacado.nome,
      documento: sacado.cpfCnpj,
      email: sacado.email,
      cep: sacado.cep,
      endereco: sacado.endereco,
      numero: sacado.numero,
      complemento: sacado.complemento,
      bairro: sacado.bairro,
    };
  }
  return {
    origem: "ALUNO",
    id: aluno.id,
    nome: aluno.nome,
    documento: aluno.cpf,
    email: aluno.email,
    cep: aluno.cep,
    endereco: aluno.endereco,
    numero: aluno.numero,
    complemento: aluno.complemento,
    bairro: aluno.bairro,
  };
}

/** Problemas que impedem (erro) ou podem atrapalhar (aviso) a emissão para esta parcela. */
export function avisosDaNota(parcela: ParcelaParaNota, tomador = tomadorDe(parcela)) {
  const erros: string[] = [];
  const avisos: string[] = [];
  if (!tomador.nome?.trim()) erros.push("Tomador sem nome");
  if (![11, 14].includes(tomador.documento.replace(/\D/g, "").length)) erros.push("Tomador sem CPF/CNPJ válido");
  if (valorDaNota(parcela) <= 0) erros.push("Valor da nota inválido");
  if (!tomador.cep) avisos.push("Tomador sem CEP — o Asaas pode recusar a nota");
  return { erros, avisos };
}

/** Valor da nota = o que foi efetivamente pago (inclui multa/juros, se houve). */
export function valorDaNota(parcela: ParcelaParaNota): number {
  return Number(parcela.valorPago ?? parcela.valor);
}

type Config = Awaited<ReturnType<typeof configuracoesRepository.obterOuCriar>>;

/** Clientes de cada provedor, criados uma vez por lote (abrir o certificado tem custo). */
interface ContextoEmissao {
  asaas?: AsaasClient;
  nacional?: SefinClient;
}

const STATUS_LOCAL: Record<StatusNotaAsaas, string> = {
  SCHEDULED: "AGENDADA",
  AUTHORIZED: "AUTORIZADA",
  PROCESSING_CANCELLATION: "AUTORIZADA",
  CANCELED: "CANCELADA",
  CANCELLATION_DENIED: "AUTORIZADA",
  ERROR: "ERRO",
};

function mensagem(erro: unknown): string {
  return (erro instanceof Error ? erro.message : "Erro desconhecido").slice(0, 500);
}

async function gravarNota(parcelaId: string, nota: AsaasNota) {
  const status = STATUS_LOCAL[nota.status] ?? "AGENDADA";
  await nfseRepository.update(parcelaId, {
    nfseAsaasId: nota.id,
    nfseStatus: status,
    nfseNumero: nota.number ?? null,
    nfsePdfUrl: nota.pdfUrl ?? null,
    nfseErro: status === "ERRO" ? (nota.statusDescription ?? "Asaas recusou a nota") : null,
    ...(status === "AUTORIZADA" ? { nfseEmitidaEm: new Date() } : {}),
  });
  return status;
}

export interface ResultadoEmissao {
  /** Notas autorizadas (emitidas) nesta execução. */
  emitidas: number;
  /** Notas aceitas pelo Asaas mas ainda processando — a conferência de status fecha depois. */
  agendadas: number;
  erros: { parcelaId: string; erro: string }[];
  /** Pendentes que ficaram para a próxima execução (limite por execução). */
  restantes: number;
}

export const nfseService = {
  /**
   * Prévia do que seria emitido para o mês de referência (padrão: mês anterior):
   * parcelas de mensalidade/renegociação pagas no mês, com o tomador e os avisos.
   */
  async previa(ref: MesReferencia = mesAnterior(new Date()), hoje = new Date()) {
    const config = await configuracoesRepository.obterOuCriar();
    const { inicio, fim } = limitesDoMes(ref);
    const [pendentes, notas] = await Promise.all([
      nfseRepository.listarPendentes(inicio, fim),
      nfseRepository.listarNotasDaCompetencia(inicio, fim),
    ]);
    const itens = pendentes.map((p) => {
      const tomador = tomadorDe(p);
      return {
        parcelaId: p.id,
        parcela: p.parcela,
        tipoTitulo: p.tipoTitulo,
        dataPagamento: p.dataPagamento,
        valor: valorDaNota(p),
        aluno: p.matricula.aluno.nome,
        curso: p.matricula.curso.nome,
        matricula: p.matricula.numeroMatricula,
        tomador: { origem: tomador.origem, nome: tomador.nome, documento: tomador.documento },
        statusNota: p.nfseStatus,
        erro: p.nfseErro,
        ...avisosDaNota(p, tomador),
      };
    });
    return {
      competencia: competenciaDoMes(ref),
      ativa: config.nfseAtiva,
      diaLimite: config.nfseDiaLimite,
      // A emissão automática só roda nos primeiros dias do mês seguinte à competência.
      janelaAberta: hoje.getDate() <= config.nfseDiaLimite,
      pendentes: itens,
      totalPendente: itens.reduce((soma, i) => soma + i.valor, 0),
      emitidas: notas.map((p) => ({
        parcelaId: p.id,
        aluno: p.matricula.aluno.nome,
        tomador: tomadorDe(p).nome,
        valor: valorDaNota(p),
        status: p.nfseStatus,
        numero: p.nfseNumero,
        pdfUrl: p.nfsePdfUrl,
        viaSefin: Boolean(p.nfseChaveAcesso),
        erro: p.nfseErro,
      })),
    };
  },

  /**
   * Emite as notas pendentes do mês de referência (uma por parcela paga). Cada falha fica
   * registrada na parcela (`nfseErro`) sem derrubar as demais; erro de cadastro do tomador
   * nem é enviado ao Asaas.
   */
  async emitirPendentes(
    ref: MesReferencia,
    usuarioId: string | null,
    opcoes: { limite?: number; cliente?: AsaasClient; nacional?: SefinClient } = {},
  ): Promise<ResultadoEmissao> {
    const config = await configuracoesRepository.obterOuCriar();
    const contexto = await this.contexto(config, opcoes);
    const { inicio, fim } = limitesDoMes(ref);
    const limite = opcoes.limite ?? LIMITE_POR_EXECUCAO;

    const total = await nfseRepository.contarPendentes(inicio, fim);
    const pendentes = await nfseRepository.listarPendentes(inicio, fim, limite);
    const resultado: ResultadoEmissao = { emitidas: 0, agendadas: 0, erros: [], restantes: Math.max(0, total - pendentes.length) };

    for (const parcela of pendentes) {
      try {
        const status = await this.emitirUma(parcela, competenciaDoMes(ref), contexto, config);
        if (status === "AUTORIZADA") resultado.emitidas += 1;
        else if (status === "AGENDADA") resultado.agendadas += 1;
        else resultado.erros.push({ parcelaId: parcela.id, erro: parcela.nfseErro ?? "Nota recusada" });
      } catch (erro) {
        resultado.erros.push({ parcelaId: parcela.id, erro: mensagem(erro) });
      }
    }

    if (usuarioId && (resultado.emitidas || resultado.agendadas || resultado.erros.length)) {
      await registrarAuditoria({
        usuarioId,
        entidade: "Nfse",
        entidadeId: competenciaDoMes(ref),
        acao: "CRIACAO",
        detalhes: { competencia: competenciaDoMes(ref), emitidas: resultado.emitidas, agendadas: resultado.agendadas, erros: resultado.erros.length },
      });
    }
    return resultado;
  },

  /** Clientes do provedor escolhido (Asaas ou emissão direta na SEFIN Nacional). */
  async contexto(config: Config, opcoes: { cliente?: AsaasClient; nacional?: SefinClient } = {}): Promise<ContextoEmissao> {
    if (config.nfseProvedor === "NACIONAL") return { nacional: opcoes.nacional ?? criarClienteSefin(config) };
    return { asaas: opcoes.cliente ?? (await obterClienteAsaas()) };
  },

  /**
   * Emite a nota de uma parcela com a competência informada ("AAAA-MM-DD"). Devolve a
   * situação local resultante. Notas já agendadas no Asaas seguem pelo Asaas mesmo que o
   * provedor tenha sido trocado depois — emitir de novo duplicaria a nota.
   */
  async emitirUma(
    parcela: ParcelaParaNota,
    competencia: string,
    contexto: ContextoEmissao,
    config: Config,
  ): Promise<string> {
    const tomador = tomadorDe(parcela);
    const { erros } = avisosDaNota(parcela, tomador);
    if (erros.length) {
      await nfseRepository.update(parcela.id, { nfseStatus: "ERRO", nfseErro: erros.join("; ") });
      parcela.nfseErro = erros.join("; ");
      return "ERRO";
    }

    if (config.nfseProvedor === "NACIONAL" && !parcela.nfseAsaasId) {
      const nacional = contexto.nacional ?? criarClienteSefin(config);
      return nfseNacionalService.emitir(parcela, tomador, competencia, config, nacional);
    }

    const cliente = contexto.asaas ?? (await obterClienteAsaas());
    let notaId = parcela.nfseAsaasId;
    try {
      if (!notaId) {
        const customerId =
          tomador.origem === "SACADO"
            ? await asaasService.obterOuCriarClienteSacado(tomador.id)
            : await asaasService.obterOuCriarClienteAluno(tomador.id);

        // Clientes criados antes da NFS-e não têm endereço no Asaas — a nota precisa.
        if (tomador.cep) {
          await cliente
            .atualizarCliente(customerId, {
              postalCode: tomador.cep.replace(/\D/g, ""),
              ...(tomador.endereco ? { address: tomador.endereco } : {}),
              ...(tomador.numero ? { addressNumber: tomador.numero } : {}),
              ...(tomador.complemento ? { complement: tomador.complemento } : {}),
              ...(tomador.bairro ? { province: tomador.bairro } : {}),
            })
            .catch(() => undefined);
        }

        const agendada = await cliente.agendarNota({
          customer: customerId,
          serviceDescription: config.nfseServicoDescricao,
          observations: `Parcela ${parcela.parcela} (${parcela.tipoTitulo ?? "Mensalidade"}) — ${parcela.matricula.curso.nome}. Aluno: ${parcela.matricula.aluno.nome}.`,
          externalReference: parcela.id,
          value: valorDaNota(parcela),
          deductions: 0,
          effectiveDate: competencia,
          ...(config.nfseMunicipalServiceId ? { municipalServiceId: config.nfseMunicipalServiceId } : {}),
          municipalServiceCode: config.nfseServicoCodigo,
          municipalServiceName: config.nfseServicoNome,
          // Simples Nacional: a nota sai sem retenções (igual à nota de exemplo da empresa).
          taxes: { retainIss: false, iss: Number(config.nfseIssPercentual), pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 },
        });
        notaId = agendada.id;
        await nfseRepository.update(parcela.id, {
          nfseAsaasId: notaId,
          nfseStatus: "AGENDADA",
          nfseCompetencia: new Date(`${competencia}T12:00:00`),
          nfseErro: null,
        });
      }

      const emitida = await cliente.emitirNota(notaId);
      return await gravarNota(parcela.id, emitida);
    } catch (erro) {
      const texto = mensagem(erro);
      // Se a nota já foi agendada, continua "agendada" (a próxima execução tenta emitir de novo).
      await nfseRepository.update(parcela.id, {
        nfseStatus: notaId ? "AGENDADA" : "ERRO",
        nfseErro: texto,
      });
      parcela.nfseErro = texto;
      throw erro;
    }
  },

  /** Confere no Asaas as notas agendadas: número e PDF aparecem quando a prefeitura autoriza. */
  async atualizarStatus(cliente?: AsaasClient): Promise<{ conferidas: number; autorizadas: number; erros: number }> {
    const agendadas = await nfseRepository.listarAgendadas();
    if (agendadas.length === 0) return { conferidas: 0, autorizadas: 0, erros: 0 };
    const asaas = cliente ?? (await obterClienteAsaas());
    const resumo = { conferidas: 0, autorizadas: 0, erros: 0 };
    for (const parcela of agendadas) {
      try {
        const nota = await asaas.consultarNota(parcela.nfseAsaasId as string);
        const status = await gravarNota(parcela.id, nota);
        resumo.conferidas += 1;
        if (status === "AUTORIZADA") resumo.autorizadas += 1;
        if (status === "ERRO") resumo.erros += 1;
      } catch (erro) {
        console.error(`[nfse] falha ao conferir nota da parcela ${parcela.id}`, mensagem(erro));
      }
    }
    return resumo;
  },

  /** Reenvia uma parcela com erro/agendada (botão da tela de notas). */
  async reemitirParcela(parcelaId: string, usuarioId: string) {
    const parcela = await nfseRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    if (parcela.status !== "PAGO") throw new ValidationError("Só parcelas pagas geram nota");
    if (parcela.nfseStatus === "AUTORIZADA") throw new ValidationError("A nota desta parcela já foi emitida");
    if (!parcela.dataPagamento) throw new ValidationError("Parcela sem data de pagamento");

    const config = await configuracoesRepository.obterOuCriar();
    const contexto = await this.contexto(config);
    const status = await this.emitirUma(parcela, competenciaPadrao(parcela.dataPagamento), contexto, config).catch(() => "ERRO");
    await registrarAuditoria({
      usuarioId,
      entidade: "Parcela",
      entidadeId: parcelaId,
      acao: "ATUALIZACAO",
      detalhes: { acao: "nfse_reemitida", status },
    });
    return nfseRepository.findById(parcelaId);
  },

  /**
   * Pagamentos já realizados (de qualquer tipo/mês) para emitir uma nota individual: busca por
   * aluno, CPF/CNPJ ou matrícula e/ou período de pagamento.
   */
  async buscarPagamentos(filtros: { busca?: string; inicio?: Date; fim?: Date }) {
    const parcelas = await nfseRepository.buscarPagas({ ...filtros, limite: 50 });
    return parcelas.map((p) => {
      const tomador = tomadorDe(p);
      return {
        parcelaId: p.id,
        parcela: p.parcela,
        tipoTitulo: p.tipoTitulo,
        geraNotaAutomatica: TIPOS_COM_NFSE.some((t) => t.toLowerCase() === (p.tipoTitulo ?? "").toLowerCase()),
        dataPagamento: p.dataPagamento,
        valor: valorDaNota(p),
        aluno: p.matricula.aluno.nome,
        curso: p.matricula.curso.nome,
        matricula: p.matricula.numeroMatricula,
        tomador: { origem: tomador.origem, nome: tomador.nome, documento: tomador.documento },
        competenciaPadrao: p.dataPagamento ? competenciaPadrao(p.dataPagamento) : null,
        statusNota: p.nfseStatus,
        numeroNota: p.nfseNumero,
        erro: p.nfseErro,
        pdfUrl: p.nfsePdfUrl,
        viaSefin: Boolean(p.nfseChaveAcesso),
        ...avisosDaNota(p, tomador),
      };
    });
  },

  /**
   * Emissão individual de uma nota sobre um pagamento realizado. Vale para qualquer parcela
   * paga (inclusive tipos que a rotina automática ignora); a competência é a escolhida ou, se
   * não vier, o último dia do mês do pagamento (limitado a hoje: não existe competência futura).
   */
  async emitirParaParcela(parcelaId: string, usuarioId: string, opcoes: { competencia?: string; hoje?: Date } = {}) {
    const parcela = await nfseRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    if (parcela.status !== "PAGO") throw new ValidationError("Só é possível emitir nota de uma parcela paga");
    if (parcela.nfseStatus === "AUTORIZADA") throw new ValidationError("A nota desta parcela já foi emitida");
    if (!parcela.dataPagamento) throw new ValidationError("Parcela sem data de pagamento");

    const hoje = opcoes.hoje ?? new Date();
    const competencia = opcoes.competencia ?? competenciaPadrao(parcela.dataPagamento, hoje);
    if (competencia > dataIso(hoje)) throw new ValidationError("A competência não pode ser uma data futura");

    const config = await configuracoesRepository.obterOuCriar();
    const contexto = await this.contexto(config);
    let resultado: string;
    try {
      resultado = await this.emitirUma(parcela, competencia, contexto, config);
    } catch (erro) {
      resultado = "ERRO";
      await registrarAuditoria({
        usuarioId,
        entidade: "Parcela",
        entidadeId: parcelaId,
        acao: "ATUALIZACAO",
        detalhes: { acao: "nfse_emissao_individual", competencia, resultado },
      });
      throw erro;
    }
    await registrarAuditoria({
      usuarioId,
      entidade: "Parcela",
      entidadeId: parcelaId,
      acao: "ATUALIZACAO",
      detalhes: { acao: "nfse_emissao_individual", competencia, resultado },
    });
    if (resultado === "ERRO") throw new ValidationError(parcela.nfseErro ?? "Nota recusada");
    return nfseRepository.findById(parcelaId);
  },

  /**
   * Execução automática (job diário): só com a emissão ligada e dentro da janela — no mês
   * corrente, até o dia limite, emite as notas do mês anterior. Fora da janela só confere status.
   */
  async executarAutomatico(hoje = new Date()) {
    const config = await configuracoesRepository.obterOuCriar();
    if (!config.nfseAtiva) return { executou: false as const, motivo: "NFS-e desligada" };

    const status = await this.atualizarStatus();
    if (hoje.getDate() > config.nfseDiaLimite) {
      return { executou: false as const, motivo: "Fora da janela de emissão", status };
    }
    const emissao = await this.emitirPendentes(mesAnterior(hoje), null);
    return { executou: true as const, emissao, status };
  },
};
