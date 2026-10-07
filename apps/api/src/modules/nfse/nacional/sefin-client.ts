import https from "node:https";
import zlib from "node:zlib";
import { AppError } from "../../../shared/errors/app-error";
import type { CertificadoA1 } from "./certificado";

export type AmbienteNfse = "HOMOLOGACAO" | "PRODUCAO";

export const ENDPOINTS: Record<AmbienteNfse, { sefin: string; danfse: string }> = {
  HOMOLOGACAO: {
    sefin: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    danfse: "https://adn.producaorestrita.nfse.gov.br/danfse",
  },
  PRODUCAO: {
    sefin: "https://sefin.nfse.gov.br/SefinNacional",
    danfse: "https://adn.nfse.gov.br/danfse",
  },
};

export interface RespostaHttp {
  status: number;
  corpo: Buffer;
}

/** Transporte HTTP com autenticação mútua (mTLS). Separado para os testes não saírem à rede. */
export type Transporte = (req: {
  url: string;
  metodo: "GET" | "POST" | "HEAD";
  headers: Record<string, string>;
  corpo?: string;
  certificado: CertificadoA1;
  timeoutMs: number;
}) => Promise<RespostaHttp>;

export const transporteHttps: Transporte = ({ url, metodo, headers, corpo, certificado, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const alvo = new URL(url);
    const req = https.request(
      {
        hostname: alvo.hostname,
        path: `${alvo.pathname}${alvo.search}`,
        method: metodo,
        headers: { ...headers, ...(corpo ? { "content-length": String(Buffer.byteLength(corpo)) } : {}) },
        key: certificado.keyPem,
        cert: certificado.certPem,
        // A SEFIN recusa HTTP/2 nos caminhos autenticados — o módulo https já usa HTTP/1.1.
        timeout: timeoutMs,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (parte: Buffer) => partes.push(parte));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes) }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    if (corpo) req.write(corpo);
    req.end();
  });

export const gzipBase64 = (texto: string) => zlib.gzipSync(Buffer.from(texto, "utf8")).toString("base64");
export const gunzipBase64 = (b64: string) => zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");

interface MensagemSefin {
  codigo?: string;
  Codigo?: string;
  descricao?: string;
  Descricao?: string;
  complemento?: string;
  Complemento?: string;
}

/** Rejeição devolvida pela SEFIN (regra fiscal): vira erro 422 com os códigos. */
export class NfseRejeitadaError extends AppError {
  constructor(public readonly mensagens: { codigo: string; descricao: string; complemento?: string }[]) {
    const [primeira] = mensagens;
    const resto = mensagens.length > 1 ? ` (+${mensagens.length - 1})` : "";
    super(
      primeira
        ? `Rejeição da SEFIN [${primeira.codigo}]: ${primeira.descricao}${primeira.complemento ? ` — ${primeira.complemento}` : ""}${resto}`
        : "Nota rejeitada pela SEFIN",
      422,
      "NFSE_REJEITADA",
      mensagens,
    );
  }
}

function extrairMensagens(json: Record<string, unknown> | null): NfseRejeitadaError["mensagens"] {
  const bruto = (json?.erros ?? json?.erro) as MensagemSefin | MensagemSefin[] | undefined;
  const lista = Array.isArray(bruto) ? bruto : bruto ? [bruto] : [];
  return lista.map((m) => ({
    codigo: m.codigo ?? m.Codigo ?? "?",
    descricao: m.descricao ?? m.Descricao ?? "Erro sem descrição",
    ...((m.complemento ?? m.Complemento) ? { complemento: m.complemento ?? m.Complemento } : {}),
  }));
}

function lerJson(corpo: Buffer): Record<string, unknown> | null {
  try {
    return JSON.parse(corpo.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface NotaEmitida {
  chaveAcesso: string;
  idDps: string | null;
  xml: string;
}

/** Cliente da SEFIN Nacional (emissão, consulta e DANFSe) com o certificado A1 da empresa. */
export class SefinClient {
  constructor(
    private readonly certificado: CertificadoA1,
    private readonly ambiente: AmbienteNfse,
    private readonly transporte: Transporte = transporteHttps,
    private readonly timeoutMs = 30_000,
  ) {}

  private async chamar(
    base: "sefin" | "danfse",
    metodo: "GET" | "POST" | "HEAD",
    caminho: string,
    json?: unknown,
    accept = "application/json",
  ): Promise<RespostaHttp> {
    try {
      return await this.transporte({
        url: `${ENDPOINTS[this.ambiente][base]}${caminho}`,
        metodo,
        headers: { accept, ...(json ? { "content-type": "application/json" } : {}) },
        ...(json ? { corpo: JSON.stringify(json) } : {}),
        certificado: this.certificado,
        timeoutMs: this.timeoutMs,
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new AppError(`Falha de comunicação com a SEFIN Nacional: ${motivo}`, 502, "NFSE_SEM_COMUNICACAO");
    }
  }

  /** Envia a DPS assinada (síncrono): devolve a NFS-e gerada ou lança a rejeição da SEFIN. */
  async emitir(dpsXmlAssinado: string): Promise<NotaEmitida> {
    const resposta = await this.chamar("sefin", "POST", "/nfse", { dpsXmlGZipB64: gzipBase64(dpsXmlAssinado) });
    const json = lerJson(resposta.corpo);
    if (resposta.status < 300 && typeof json?.chaveAcesso === "string" && typeof json.nfseXmlGZipB64 === "string") {
      return {
        chaveAcesso: json.chaveAcesso,
        idDps: typeof json.idDps === "string" ? json.idDps : null,
        xml: gunzipBase64(json.nfseXmlGZipB64),
      };
    }
    this.lancarErro(resposta, json);
  }

  /** Consulta uma DPS já enviada: devolve a chave da NFS-e, ou null se não gerou nota. */
  async consultarDps(idDps: string): Promise<string | null> {
    const resposta = await this.chamar("sefin", "GET", `/dps/${idDps}`);
    if (resposta.status === 404) return null;
    const json = lerJson(resposta.corpo);
    if (resposta.status < 300 && typeof json?.chaveAcesso === "string") return json.chaveAcesso;
    this.lancarErro(resposta, json);
  }

  async consultarNfse(chaveAcesso: string): Promise<string> {
    const resposta = await this.chamar("sefin", "GET", `/nfse/${chaveAcesso}`);
    const json = lerJson(resposta.corpo);
    if (resposta.status < 300 && typeof json?.nfseXmlGZipB64 === "string") return gunzipBase64(json.nfseXmlGZipB64);
    this.lancarErro(resposta, json);
  }

  /** PDF do DANFSe (documento auxiliar) da nota. */
  async baixarDanfse(chaveAcesso: string): Promise<Buffer> {
    const resposta = await this.chamar("danfse", "GET", `/${chaveAcesso}`, undefined, "application/pdf");
    if (resposta.status < 300 && resposta.corpo.subarray(0, 4).toString() === "%PDF") return resposta.corpo;
    this.lancarErro(resposta, lerJson(resposta.corpo));
  }

  private lancarErro(resposta: RespostaHttp, json: Record<string, unknown> | null): never {
    const mensagens = extrairMensagens(json);
    if (mensagens.length) throw new NfseRejeitadaError(mensagens);
    if (resposta.status === 401 || resposta.status === 403) {
      throw new AppError(
        "A SEFIN recusou o certificado (acesso negado). Confira se o certificado é do CNPJ da empresa e está válido.",
        502,
        "NFSE_CERTIFICADO_RECUSADO",
      );
    }
    throw new AppError(`A SEFIN respondeu HTTP ${resposta.status} sem detalhes`, 502, "NFSE_RESPOSTA_INESPERADA");
  }
}
