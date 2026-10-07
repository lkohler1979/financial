import { NotFoundError, ValidationError } from "../../../shared/errors/app-error";
import { criptografar, decifrar } from "../../../shared/utils/criptografia";
import { registrarAuditoria } from "../../auditoria/auditoria.service";
import { configuracoesRepository } from "../../configuracoes/configuracoes.repository";
import { nfseRepository, type ParcelaParaNota } from "../nfse.repository";
import type { TomadorNota } from "../nfse.service";
import { assinarDps } from "./assinatura";
import { lerCertificadoA1, type CertificadoA1 } from "./certificado";
import { montarDpsXml, montarIdDps, type DadosDps, type EnderecoTomadorDps } from "./dps";
import { NfseRejeitadaError, SefinClient } from "./sefin-client";

type Config = Awaited<ReturnType<typeof configuracoesRepository.obterOuCriar>>;

const apenasDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** "08.01.01" → "080101" (código de tributação nacional, 6 dígitos). */
export const codigoTributacaoNacional = (codigo: string) => apenasDigitos(codigo);

/** Código IBGE do município pelo CEP (ViaCEP). Sem internet/CEP inexistente → null. */
export async function municipioPorCep(cep: string): Promise<string | null> {
  const digitos = apenasDigitos(cep);
  if (digitos.length !== 8) return null;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: AbortSignal.timeout(5000) });
    const dados = (await resposta.json()) as { ibge?: string; erro?: boolean };
    return !dados.erro && dados.ibge && /^\d{7}$/.test(dados.ibge) ? dados.ibge : null;
  } catch {
    return null;
  }
}

/** O que falta configurar para a emissão direta funcionar (vazio = pronto). */
export function pendenciasDaConfiguracao(config: Config): string[] {
  const pendencias: string[] = [];
  if (!config.nfseCertificadoCriptografado || !config.nfseCertificadoSenhaCriptografada) {
    pendencias.push("certificado digital A1 não cadastrado");
  } else if (config.nfseCertificadoValidoAte && config.nfseCertificadoValidoAte.getTime() < Date.now()) {
    pendencias.push("certificado digital vencido");
  }
  if (apenasDigitos(config.nfsePrestadorCnpj ?? config.nfseCertificadoCnpj).length !== 14) pendencias.push("CNPJ do prestador");
  if (!/^\d{7}$/.test(config.nfseMunicipioIbge ?? "")) pendencias.push("código IBGE do município (7 dígitos)");
  if (codigoTributacaoNacional(config.nfseServicoCodigo).length !== 6) pendencias.push("código do serviço (ex.: 08.01.01)");
  return pendencias;
}

/** Abre o certificado guardado (decifra o .pfx e a senha). */
export function certificadoDaConfiguracao(config: Config): CertificadoA1 {
  const pendencias = pendenciasDaConfiguracao(config);
  if (pendencias.length) throw new ValidationError(`Emissão direta não configurada: ${pendencias.join("; ")}`);
  return lerCertificadoA1(
    Buffer.from(decifrar(config.nfseCertificadoCriptografado as string), "base64"),
    decifrar(config.nfseCertificadoSenhaCriptografada as string),
  );
}

export function criarClienteSefin(config: Config): SefinClient {
  return new SefinClient(certificadoDaConfiguracao(config), config.nfseAmbiente);
}

function mensagem(erro: unknown): string {
  return (erro instanceof Error ? erro.message : "Erro desconhecido").slice(0, 500);
}

export interface OpcoesEmissaoNacional {
  consultarMunicipio?: (cep: string) => Promise<string | null>;
  agora?: Date;
}

export const nfseNacionalService = {
  /** Situação para a tela de configuração: o que falta para emitir direto. */
  async situacao() {
    const config = await configuracoesRepository.obterOuCriar();
    const pendencias = pendenciasDaConfiguracao(config);
    return { pronto: pendencias.length === 0, pendencias };
  },

  /** Valida e guarda o certificado A1 (.pfx em base64 + senha), criptografados. */
  async salvarCertificado(pfxBase64: string, senha: string, usuarioId: string) {
    const pfx = Buffer.from(pfxBase64, "base64");
    if (pfx.length === 0) throw new ValidationError("Arquivo do certificado vazio");
    const certificado = lerCertificadoA1(pfx, senha);
    const atual = await configuracoesRepository.obterOuCriar();
    await configuracoesRepository.atualizar({
      nfseCertificadoCriptografado: criptografar(pfx.toString("base64")),
      nfseCertificadoSenhaCriptografada: criptografar(senha),
      nfseCertificadoTitular: certificado.titular,
      nfseCertificadoCnpj: certificado.cnpj,
      nfseCertificadoValidoAte: certificado.validoAte,
      // Primeira vez: já sugere o CNPJ do certificado como prestador.
      ...(!atual.nfsePrestadorCnpj && certificado.cnpj ? { nfsePrestadorCnpj: certificado.cnpj } : {}),
    });
    await registrarAuditoria({
      usuarioId,
      entidade: "Configuracao",
      entidadeId: atual.id,
      acao: "ATUALIZACAO",
      detalhes: { acao: "nfse_certificado_cadastrado", titular: certificado.titular, validoAte: certificado.validoAte.toISOString() },
    });
    return { titular: certificado.titular, cnpj: certificado.cnpj, validoAte: certificado.validoAte };
  },

  async removerCertificado(usuarioId: string) {
    const atual = await configuracoesRepository.obterOuCriar();
    await configuracoesRepository.atualizar({
      nfseCertificadoCriptografado: null,
      nfseCertificadoSenhaCriptografada: null,
      nfseCertificadoTitular: null,
      nfseCertificadoCnpj: null,
      nfseCertificadoValidoAte: null,
    });
    await registrarAuditoria({
      usuarioId,
      entidade: "Configuracao",
      entidadeId: atual.id,
      acao: "ATUALIZACAO",
      detalhes: { acao: "nfse_certificado_removido" },
    });
  },

  /** Confere se o certificado é aceito pela SEFIN (handshake mTLS) sem emitir nada. */
  async testarConexao(cliente?: SefinClient): Promise<{ ok: boolean; mensagem: string }> {
    try {
      const config = await configuracoesRepository.obterOuCriar();
      const sefin = cliente ?? criarClienteSefin(config);
      const id = montarIdDps({
        serie: config.nfseSerieDps,
        numero: 999_999_999,
        municipioIbge: config.nfseMunicipioIbge ?? "0000000",
        cnpj: config.nfsePrestadorCnpj ?? config.nfseCertificadoCnpj ?? "",
      });
      await sefin.consultarDps(id);
      return { ok: true, mensagem: `Conexão com a SEFIN (${config.nfseAmbiente === "PRODUCAO" ? "produção" : "homologação"}) funcionando.` };
    } catch (erro) {
      // Uma rejeição de regra significa que a SEFIN respondeu e aceitou o certificado.
      if (erro instanceof NfseRejeitadaError) return { ok: true, mensagem: `A SEFIN respondeu: ${erro.message}` };
      return { ok: false, mensagem: mensagem(erro) };
    }
  },

  /**
   * Emite a NFS-e da parcela direto na SEFIN Nacional. Grava o resultado na parcela (nota
   * autorizada ou erro) e, em caso de erro, relança para o chamador contar a falha.
   */
  async emitir(
    parcela: ParcelaParaNota,
    tomador: TomadorNota,
    competencia: string,
    config: Config,
    cliente: SefinClient,
    opcoes: OpcoesEmissaoNacional = {},
  ): Promise<string> {
    const municipioIbge = config.nfseMunicipioIbge as string;
    const cnpj = apenasDigitos(config.nfsePrestadorCnpj ?? config.nfseCertificadoCnpj);

    // O número da DPS é reservado e gravado ANTES do envio: se a resposta se perder, a nova
    // tentativa usa o mesmo Id (a SEFIN deduplica) e recupera a nota em vez de duplicá-la.
    let serie = parcela.nfseSerieDps;
    let numero = parcela.nfseNumeroDps;
    const jaTinhaNumero = Boolean(numero && serie);
    if (!numero || !serie) {
      ({ serie, numero } = await configuracoesRepository.reservarNumeroDps());
      await nfseRepository.update(parcela.id, { nfseNumeroDps: numero, nfseSerieDps: serie });
    }

    try {
      if (jaTinhaNumero) {
        const chave = await cliente.consultarDps(montarIdDps({ serie, numero, municipioIbge, cnpj }));
        if (chave) return await this.gravarNota(parcela.id, chave, await cliente.consultarNfse(chave), competencia);
      }

      let endereco: EnderecoTomadorDps | null = null;
      if (tomador.cep && tomador.endereco && tomador.bairro) {
        const ibge = await (opcoes.consultarMunicipio ?? municipioPorCep)(tomador.cep);
        if (ibge) {
          endereco = {
            municipioIbge: ibge,
            cep: tomador.cep,
            logradouro: tomador.endereco,
            numero: tomador.numero ?? "S/N",
            complemento: tomador.complemento,
            bairro: tomador.bairro,
          };
        }
      }

      const dados: DadosDps = {
        tipoAmbiente: config.nfseAmbiente === "PRODUCAO" ? 1 : 2,
        serie,
        numero,
        // Um minuto atrás: relógio do servidor adiantado em relação à SEFIN rejeita a DPS.
        emitidaEm: new Date((opcoes.agora ?? new Date()).getTime() - 60_000),
        competencia,
        prestador: {
          cnpj,
          inscricaoMunicipal: config.nfsePrestadorInscricaoMunicipal,
          telefone: config.nfsePrestadorTelefone,
          email: config.nfsePrestadorEmail,
          opcaoSimples: config.nfseOpcaoSimples,
          regimeApuracaoSn: config.nfseRegimeApuracaoSn,
          regimeEspecial: config.nfseRegimeEspecial,
          municipioIbge,
        },
        tomador: { documento: tomador.documento, nome: tomador.nome, email: tomador.email, endereco },
        servico: {
          codigoTributacaoNacional: codigoTributacaoNacional(config.nfseServicoCodigo),
          codigoTributacaoMunicipal: config.nfseCodigoTributacaoMunicipal,
          descricao: config.nfseServicoDescricao,
          informacoesComplementares: `Parcela ${parcela.parcela} (${parcela.tipoTitulo ?? "Mensalidade"}) — ${parcela.matricula.curso.nome}. Aluno: ${parcela.matricula.aluno.nome}.`,
        },
        valor: Number(parcela.valorPago ?? parcela.valor),
        aliquotaSimples: Number(config.nfseAliquotaSimples),
      };

      const certificado = certificadoDaConfiguracao(config);
      const nota = await cliente.emitir(assinarDps(montarDpsXml(dados), certificado));
      return await this.gravarNota(parcela.id, nota.chaveAcesso, nota.xml, competencia);
    } catch (erro) {
      await nfseRepository.update(parcela.id, { nfseStatus: "ERRO", nfseErro: mensagem(erro) });
      parcela.nfseErro = mensagem(erro);
      throw erro;
    }
  },

  async gravarNota(parcelaId: string, chaveAcesso: string, xml: string, competencia: string): Promise<string> {
    await nfseRepository.update(parcelaId, {
      nfseChaveAcesso: chaveAcesso,
      nfseStatus: "AUTORIZADA",
      nfseNumero: /<nNFSe>(\d+)<\/nNFSe>/.exec(xml)?.[1] ?? null,
      nfseXml: xml,
      nfseEmitidaEm: new Date(),
      nfseCompetencia: new Date(`${competencia}T12:00:00`),
      nfseErro: null,
    });
    return "AUTORIZADA";
  },

  /** PDF (DANFSe) de uma nota emitida direto na SEFIN. */
  async baixarDanfse(parcelaId: string, cliente?: SefinClient): Promise<{ pdf: Buffer; nomeArquivo: string }> {
    const parcela = await nfseRepository.findById(parcelaId);
    if (!parcela) throw new NotFoundError("Parcela não encontrada");
    if (!parcela.nfseChaveAcesso) throw new ValidationError("Esta nota não foi emitida direto na SEFIN — use o PDF do Asaas");
    const config = await configuracoesRepository.obterOuCriar();
    const pdf = await (cliente ?? criarClienteSefin(config)).baixarDanfse(parcela.nfseChaveAcesso);
    return { pdf, nomeArquivo: `NFSe-${parcela.nfseNumero ?? parcela.nfseChaveAcesso}.pdf` };
  },
};
