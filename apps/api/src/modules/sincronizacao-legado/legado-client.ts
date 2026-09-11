// Cliente HTTP para o sistema legado (Universa Educacional), substituindo o
// crawler baseado em navegador (gerarRelatorioWord.js/.env do script antigo)
// por chamadas diretas às rotas JSON internas do próprio sistema, autenticadas
// por sessão (cookie PHPSESSID). Endpoints confirmados ao vivo em 2026-09-11
// contra `ethoson.universaeducacional.com.br`:
//   POST /acesso/autenticacao/login                              (autenticação)
//   GET  /financeiro/financeiro-titulo/titulo-informacoes/{id}   (detalhe de 1 título)
//
// Como o Ethos já guarda `Parcela.codTitulo` (= `titulo_id` do legado, vindo
// da mesma planilha de origem), a reconciliação consulta 1 título por vez
// por esse endpoint — não precisa mais buscar por CPF nem adivinhar o
// payload de um endpoint de busca em lote (havia uma versão anterior deste
// cliente que tentava isso via POST /financeiro/financeiro-titulo/search,
// cujo payload real nunca foi confirmado; removida em favor deste endpoint,
// que devolve o mesmo dado sem ambiguidade nenhuma).

export interface LegadoConfig {
  baseUrl: string;
  usuario: string;
  senha: string;
}

export interface LegadoTituloDetalhe {
  tituloId: string;
  tituloDescricao: string;
  tituloParcela: string;
  /** Valores observados: "Aberto", "Alteracao" (título substituído por uma
   * renegociação — ver PENDENCIAS.md), presumivelmente "Pago"/"Cancelado"
   * (ainda não confirmados). */
  tituloEstado: string;
  tituloValor: number;
  tituloValorPago: number;
  /** Formato "DD/MM/AAAA" (não ISO) — ver `parseDataLegado`. */
  tituloDataVencimento: string | null;
  tituloDataPagamento: string | null;
  tituloDataBaixa: string | null;
  diasAtraso: number;
}

class SessaoExpiradaError extends Error {
  constructor() {
    super("Sessão com o sistema legado expirou ou não foi autenticada");
  }
}

/** Extrai o valor do cookie de sessão de um cabeçalho Set-Cookie (pode vir múltiplo). */
function extrairCookie(setCookieHeaders: string[]): string | null {
  for (const header of setCookieHeaders) {
    const [par] = header.split(";");
    if (par?.trim().startsWith("PHPSESSID=")) return par.trim();
  }
  return null;
}

export class LegadoClient {
  private cookie: string | null = null;

  constructor(private readonly config: LegadoConfig) {}

  /**
   * Autentica no sistema legado e guarda o cookie de sessão para as próximas
   * chamadas. Endpoint/campos confirmados em 2026-09-11 contra o sistema real:
   * `POST /acesso/autenticacao/login` com `username`/`password`
   * (form-urlencoded), sem CSRF token — o próprio `login-versao-nova.js` da
   * página só faz `$("#login-form").submit()`, um POST nativo. O 302 de
   * sucesso já traz o `Set-Cookie` (`PHPSESSID`) — não é preciso seguir o redirect.
   *
   * IMPORTANTE: `config.baseUrl` deve ser o host canônico
   * (`https://ethoson.universaeducacional.com.br`), não um alias como
   * `https://universa.ethoson.com.br` — o alias responde com 301/302 para o
   * canônico, e como o login é um POST, seguir esse redirect (`fetch` com
   * `redirect: "follow"`, ou `curl -L` sem `--post302`) rebaixaria o método
   * para GET e descartaria usuário/senha silenciosamente (foi exatamente o
   * que aconteceu na primeira tentativa de validação contra o sistema real).
   */
  async login(): Promise<void> {
    const resposta = await fetch(`${this.config.baseUrl}/acesso/autenticacao/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: this.config.usuario, password: this.config.senha }),
      redirect: "manual",
    });

    const setCookie = resposta.headers.getSetCookie?.() ?? [];
    const cookie = extrairCookie(setCookie);
    if (!cookie) {
      throw new Error(
        "Login no sistema legado não retornou cookie de sessão (PHPSESSID) — verifique usuário/senha/URL em Configurações",
      );
    }
    this.cookie = cookie;
  }

  private async requisitar(caminho: string, init: RequestInit = {}, tentouRelogar = false): Promise<Response> {
    if (!this.cookie) await this.login();

    const resposta = await fetch(`${this.config.baseUrl}${caminho}`, {
      ...init,
      headers: {
        ...init.headers,
        cookie: this.cookie ?? "",
        "x-requested-with": "XMLHttpRequest",
      },
      redirect: "manual",
    });

    // Sessão expirada normalmente redireciona para a tela de login (3xx) em
    // vez de retornar JSON — reautentica uma única vez e repete a chamada.
    if ((resposta.status >= 300 && resposta.status < 400) || resposta.status === 401) {
      if (tentouRelogar) throw new SessaoExpiradaError();
      this.cookie = null;
      await this.login();
      return this.requisitar(caminho, init, true);
    }

    if (!resposta.ok) {
      throw new Error(`Sistema legado respondeu ${resposta.status} para ${caminho}`);
    }

    return resposta;
  }

  /**
   * GET /financeiro/financeiro-titulo/titulo-informacoes/{tituloId} —
   * detalhe de um título específico (mesmo `codTitulo` já gravado em
   * `Parcela` desde a importação da planilha). Retorna `null` quando o
   * legado responde `erro: true` (título não encontrado naquele sistema).
   */
  async buscarInformacoesTitulo(tituloId: string): Promise<LegadoTituloDetalhe | null> {
    const resposta = await this.requisitar(
      `/financeiro/financeiro-titulo/titulo-informacoes/${encodeURIComponent(tituloId)}`,
    );
    const corpo = (await resposta.json()) as {
      arrDados?: Record<string, unknown>;
      erro?: boolean;
      mensagem?: string;
    };

    if (corpo.erro || !corpo.arrDados) return null;

    const d = corpo.arrDados;
    return {
      tituloId: String(d.tituloId ?? tituloId),
      tituloDescricao: String(d.tituloDescricao ?? ""),
      tituloParcela: String(d.tituloParcela ?? ""),
      tituloEstado: String(d.tituloEstado ?? ""),
      tituloValor: Number(d.tituloValor ?? 0),
      tituloValorPago: Number(d.tituloValorPago ?? 0),
      tituloDataVencimento: d.tituloDataVencimento ? String(d.tituloDataVencimento) : null,
      tituloDataPagamento: d.tituloDataPagamento ? String(d.tituloDataPagamento) : null,
      tituloDataBaixa: d.tituloDataBaixa ? String(d.tituloDataBaixa) : null,
      diasAtraso: Number(d.diasAtraso ?? 0),
    };
  }
}

/** Converte a data no formato "DD/MM/AAAA" (ou "DD/MM/AAAA HH:mm:ss") usado
 * por `titulo-informacoes` para Date — diferente do formato ISO-like visto
 * no endpoint de busca em lote (nunca confirmado/usado). */
export function parseDataLegado(valor: string | null): Date | null {
  if (!valor) return null;
  const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}
