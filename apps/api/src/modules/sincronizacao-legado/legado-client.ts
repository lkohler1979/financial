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

/**
 * Uma linha de `GET /pessoa/pessoa/search-for-json?query={cpf}&queryTipo=cpf` —
 * 1 linha por curso do aluno (parâmetro `agruparAluno=true`). Endpoint e
 * formato confirmados ao vivo em 2026-09-15 (ver PENDENCIAS.md, seção
 * "Integração com Sistema Legado"), usado pela importação por CPF na tela de
 * Aluno (`importacao-legado`).
 */
export interface LegadoPessoaCurso {
  pesId: string;
  alunoId: string;
  nome: string;
  cpf: string;
  alunocursoId: string;
  alunocursoSituacao: string;
  cursoId: string;
  cursoNome: string;
}

/**
 * Uma linha de `POST /financeiro/financeiro-titulo/search` — títulos
 * (parcelas) de uma pessoa, todos os cursos juntos (filtrar por
 * `alunocursoId` no lado do Ethos). Mesmos campos de `LegadoTituloDetalhe`
 * (dado estruturalmente igual ao de `titulo-informacoes/{id}`, só que em
 * lote), com `alunocursoId`/`cursoNome` a mais para agrupar por curso.
 */
export interface LegadoTituloResumo {
  tituloId: string;
  alunocursoId: string;
  cursoNome: string;
  tituloDescricao: string;
  tituloParcela: string;
  tituloEstado: string;
  tituloValor: number;
  tituloValorPago: number;
  tituloDataVencimento: string | null;
  tituloDataPagamento: string | null;
  tituloDataBaixa: string | null;
  diasAtraso: number;
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
   * GET /pessoa/pessoa/search-for-json?query={cpf}&queryTipo=cpf&agruparAluno=true —
   * busca uma pessoa pelo CPF, devolvendo 1 linha por curso em que ela está
   * matriculada. Endpoint e parâmetros confirmados ao vivo em 2026-09-15
   * (captura de rede real, ver PENDENCIAS.md). `cpf` deve vir formatado
   * (`000.000.000-00`), mesmo formato observado na captura. Devolve array
   * vazio quando a pessoa não é encontrada (não lança erro).
   */
  async buscarPessoaPorCpf(cpf: string): Promise<LegadoPessoaCurso[]> {
    const query = new URLSearchParams({
      query: cpf,
      queryTipo: "cpf",
      agruparAluno: "true",
      pesquisarPJ: "1",
      bloquearPesquisaPorPesId: "0",
      bloquearPesquisaPorCPF: "0",
      bloquearPesquisaPeloAlunoId: "0",
      _: String(Date.now()),
    });
    const resposta = await this.requisitar(`/pessoa/pessoa/search-for-json?${query.toString()}`);
    const corpo = (await resposta.json()) as Array<Record<string, unknown>>;

    return corpo.map((d) => ({
      pesId: String(d.pes_id ?? d.pesId ?? ""),
      alunoId: String(d.aluno_id ?? d.alunoId ?? ""),
      nome: String(d.pes_nome ?? d.pesNome ?? ""),
      cpf: String(d.pes_cpf ?? d.pesCpf ?? ""),
      alunocursoId: String(d.alunocurso_id ?? d.alunocursoId ?? ""),
      alunocursoSituacao: String(d.alunocurso_situacao ?? d.alunocursoSituacao ?? ""),
      cursoId: String(d.curso_id ?? d.cursoId ?? ""),
      cursoNome: String(d.curso_nome ?? d.cursoNome ?? ""),
    }));
  }

  /**
   * POST /financeiro/financeiro-titulo/search — lista os títulos (parcelas)
   * de uma pessoa (todos os cursos juntos), filtrando por `filter[pesId]`
   * (o `pesId` devolvido por `buscarPessoaPorCpf`). Payload (incluindo o
   * boilerplate de colunas do DataTables usado pela grade do legado)
   * confirmado ao vivo em 2026-09-15 (captura de rede real via "Copy as
   * cURL", ver PENDENCIAS.md) — não alterar a lista de colunas sem nova
   * captura, o backend do legado pode validá-la.
   *
   * IMPORTANTE: a captura original trazia `filter[tituloEstado][]` restrito
   * a "Não Aprovado"/"Aberto"/"Aguardando Pagamento" (é o filtro padrão da
   * aba "Em aberto" do painel financeiro). Para importar o histórico
   * completo (inclusive títulos já pagos), esse filtro é omitido aqui de
   * propósito — assumindo que omitir `filter[tituloEstado]` remove a
   * restrição de estado no backend do legado. **Essa suposição ainda não
   * foi confirmada ao vivo** (os valores de `titulo_estado` para
   * pago/cancelado também nunca foram confirmados, ver PENDENCIAS.md) —
   * testar contra um CPF com parcela já paga antes de confiar em produção.
   * Pagina automaticamente (`start`/`length`) até cobrir `recordsFiltered`.
   */
  async buscarTitulosPorPessoa(pesId: string): Promise<LegadoTituloResumo[]> {
    const resultado: LegadoTituloResumo[] = [];
    let start = 0;
    const length = 100;
    let recordsFiltered = Infinity;

    while (start < recordsFiltered) {
      const body = montarPayloadBuscaTitulos(pesId, start, length);
      const resposta = await this.requisitar("/financeiro/financeiro-titulo/search", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
      });
      const corpo = (await resposta.json()) as {
        data?: Array<Record<string, unknown>>;
        recordsFiltered?: number;
      };

      recordsFiltered = corpo.recordsFiltered ?? 0;
      for (const d of corpo.data ?? []) {
        resultado.push({
          tituloId: String(d.titulo_id ?? ""),
          alunocursoId: String(d.alunocurso_id ?? ""),
          cursoNome: String(d.curso_nome ?? ""),
          tituloDescricao: String(d.titulo_descricao ?? ""),
          tituloParcela: String(d.titulo_parcela ?? ""),
          tituloEstado: String(d.titulo_estado ?? ""),
          tituloValor: Number(d.titulo_valor ?? 0),
          tituloValorPago: Number(d.titulo_valor_pago ?? 0),
          // Campos `titulo_data_*` (snake_case) vêm no formato "AAAA-MM-DD
          // HH:mm:ss" nesta resposta em lote — diferente do "DD/MM/AAAA" de
          // `titulo-informacoes/{id}` — por isso usam `parseDataLegadoIso`
          // (não `parseDataLegado`) no lado do serviço que consome isto.
          tituloDataVencimento: d.titulo_data_vencimento ? String(d.titulo_data_vencimento) : null,
          tituloDataPagamento: d.titulo_data_pagamento ? String(d.titulo_data_pagamento) : null,
          tituloDataBaixa: d.titulo_data_baixa ? String(d.titulo_data_baixa) : null,
          diasAtraso: Number(d.dias_atraso ?? 0),
        });
      }

      start += length;
      // Segurança contra loop infinito se o legado devolver recordsFiltered
      // maior que o total real de linhas (nunca visto, mas não travar o worker).
      if ((corpo.data?.length ?? 0) === 0) break;
    }

    return resultado;
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
 * por `titulo-informacoes` para Date. */
export function parseDataLegado(valor: string | null): Date | null {
  if (!valor) return null;
  const match = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

/** Converte a data no formato "AAAA-MM-DD HH:mm:ss" usado pelos campos
 * `titulo_data_*` (snake_case) de `financeiro-titulo/search` — confirmado
 * ao vivo em 2026-09-15, diferente do "DD/MM/AAAA" de `titulo-informacoes`. */
export function parseDataLegadoIso(valor: string | null): Date | null {
  if (!valor) return null;
  const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, ano, mes, dia] = match;
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

/**
 * Monta o corpo (form-urlencoded) de `POST /financeiro/financeiro-titulo/search`
 * — replica o boilerplate de colunas/ordenação do DataTables capturado ao
 * vivo em 2026-09-15, trocando só paginação (`start`) e o filtro de pessoa
 * (`filter[pesId]`). Ver o comentário de `buscarTitulosPorPessoa` sobre a
 * omissão deliberada de `filter[tituloEstado]`.
 */
function montarPayloadBuscaTitulos(pesId: string, start: number, length: number): URLSearchParams {
  const colunas: Array<{ data: string; name: string; searchable: boolean; orderable: boolean }> = [
    { data: "check", name: "titulo_id", searchable: false, orderable: false },
    { data: "titulo_id", name: "titulo_id", searchable: true, orderable: true },
    { data: "pes_nome", name: "pes_nome", searchable: false, orderable: true },
    { data: "titulo_descricao", name: "titulo_descricao", searchable: true, orderable: true },
    { data: "curso_sigla", name: "curso_sigla", searchable: false, orderable: true },
    { data: "turma_nome", name: "turma_nome", searchable: false, orderable: true },
    {
      data: "titulo_data_vencimento_formatado",
      name: "titulo_data_vencimento",
      searchable: false,
      orderable: true,
    },
    {
      data: "titulo_data_pagamento_formatado",
      name: "titulo_data_pagamento",
      searchable: false,
      orderable: true,
    },
    {
      data: "titulo_valor_exibicao_formatado",
      name: "titulo_valor",
      searchable: false,
      orderable: true,
    },
    { data: "titulo_estado", name: "titulo_estado", searchable: false, orderable: true },
    { data: "acao", name: "titulo_id", searchable: false, orderable: false },
  ];

  const params = new URLSearchParams();
  params.set("draw", "1");
  colunas.forEach((coluna, indice) => {
    params.set(`columns[${indice}][data]`, coluna.data);
    params.set(`columns[${indice}][name]`, coluna.name);
    params.set(`columns[${indice}][searchable]`, String(coluna.searchable));
    params.set(`columns[${indice}][orderable]`, String(coluna.orderable));
    params.set(`columns[${indice}][search][value]`, "");
    params.set(`columns[${indice}][search][regex]`, "false");
  });
  params.set("order[0][column]", "6");
  params.set("order[0][dir]", "asc");
  params.set("order[1][column]", "1");
  params.set("order[1][dir]", "asc");
  params.set("start", String(start));
  params.set("length", String(length));
  params.set("search[value]", "");
  params.set("search[regex]", "false");
  params.set("filter[pesId]", pesId);
  params.set("filter[totalizador]", "true");

  return params;
}
