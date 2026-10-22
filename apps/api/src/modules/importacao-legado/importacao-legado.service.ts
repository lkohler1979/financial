import { StatusParcela } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../shared/errors/app-error";
import { formatarCpf, normalizarCpf } from "../../shared/utils/cpf";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { alunosRepository } from "../alunos/alunos.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { historicoRepository } from "../cobranca/historico.repository";
import { situacoesRepository } from "../cobranca/situacoes.repository";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";
import {
  parseDataLegadoIso,
  parseDataLegadoQualquer,
  type LegadoTituloDetalhe,
  type LegadoTituloResumo,
} from "../sincronizacao-legado/legado-client";
import {
  aplicarDetalheNaParcela,
  statusLegadoParaEthos,
  tipoTituloDaDescricao,
} from "../sincronizacao-legado/sincronizacao-legado.reconciliador";
import type { ConfirmarImportacaoInput } from "./importacao-legado.schema";

// Mesmo nome/cor/ordem já usados em importacao.processor.ts e
// geracao-word.worker.ts para a situação "PENDENTE" criada automaticamente
// (auto-cura via obterOuCriarPorNome) — mantém consistência entre os três
// pontos que a semeiam.
const SITUACAO_PENDENTE = "PENDENTE";

export interface PreviaParcelaLegado {
  tituloId: string;
  descricao: string;
  parcela: string;
  vencimento: string | null;
  valor: number;
  valorPago: number;
  estado: string;
  diasAtraso: number;
  /** `tipotituloNome` do legado (ex.: "Mensalidade", "Renegociação") —
   * confirmado ao vivo em 2026-09-17. Exibido na pré-visualização para o
   * usuário conferir antes de confirmar a importação. */
  tipoTitulo: string | null;
  /** Já existe uma Parcela no Ethos para este `codTitulo` — nesse caso a
   * confirmação atualiza a situação de pagamento em vez de criar de novo. */
  jaExisteNoEthos: boolean;
  /** Estado atual da Parcela no Ethos (só quando `jaExisteNoEthos`). */
  statusEthos: StatusParcela | null;
  /** O legado já mostra este título como pago/baixado — decide o valor
   * padrão do checkbox "atualizar situação de pago" na pré-visualização. */
  pagoNoLegado: boolean;
}

export interface PreviaCursoLegado {
  alunocursoId: string;
  cursoLegadoNome: string;
  cursoEthosSugerido: { id: string; codigo: string; nome: string } | null;
  matriculaJaExiste: boolean;
  parcelas: PreviaParcelaLegado[];
}

export interface PreviaImportacaoLegado {
  encontrado: boolean;
  cpf: string;
  nome: string;
  alunoJaExiste: boolean;
  cursos: PreviaCursoLegado[];
}

/**
 * Normaliza um código de título para comparação — o mesmo título pode vir do
 * legado ora com zeros à esquerda (ex.: "00000002967", como em
 * `buscarTitulosPorPessoa`), ora sem (ex.: "2967", como em planilhas de
 * importação antigas ou títulos digitados manualmente), dependendo da
 * origem. Comparar só os dígitos sem os zeros à esquerda evita criar uma
 * Parcela duplicada quando o formato difere do que já está gravado em
 * `Parcela.codTitulo` — pedido do usuário, 2026-09-15: "não deve duplicar e
 * sim atualizar". Não é usado para decidir o valor gravado (esse continua
 * sendo o `codTitulo` já existente, quando a Parcela já existe, ou o
 * `tituloId` do legado tal como veio, quando é criada agora).
 */
function normalizarCodTitulo(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  return digitos.replace(/^0+(?=\d)/, "");
}

function agruparTitulosPorAlunocurso(
  titulos: LegadoTituloResumo[],
): Map<string, LegadoTituloResumo[]> {
  const mapa = new Map<string, LegadoTituloResumo[]>();
  for (const titulo of titulos) {
    const lista = mapa.get(titulo.alunocursoId) ?? [];
    lista.push(titulo);
    mapa.set(titulo.alunocursoId, lista);
  }
  return mapa;
}

/** Matrícula sem situação de cobrança entra como "Pendente" — nunca sobrescreve uma já atribuída
 * (decisão do usuário, 2026-07-09, mesma regra de importacao.processor.ts). */
export async function garantirSituacaoPendente(
  matricula: { id: string; situacaoCobrancaId: string | null },
  situacaoPendente: { id: string; nome: string },
  usuarioId: string,
): Promise<void> {
  if (matricula.situacaoCobrancaId) return;
  await matriculasRepository.update(matricula.id, {
    situacaoCobranca: { connect: { id: situacaoPendente.id } },
  });
  await historicoRepository.registrar(
    matricula.id,
    usuarioId,
    `Situação alterada para "${situacaoPendente.nome}" (importação do sistema legado)`,
  );
}

/**
 * Grava os títulos do legado numa matrícula: cria as parcelas que não existem e atualiza a
 * situação de pagamento das que já existem (casando por código normalizado, para não duplicar
 * com/sem zeros à esquerda). `auditar: false` (importação em lote) pula a auditoria parcela a
 * parcela — o lote registra um resumo.
 */
/** Quantos títulos têm o detalhe consultado ao mesmo tempo (não sobrecarrega o legado). */
const DETALHES_EM_PARALELO = 6;

/**
 * Completa cada título da busca em lote com o que só o detalhe traz (boleto, hash do boleto e
 * remessa) e confirma Estado e Observações pela mesma fonte. Título cujo detalhe não pôde ser
 * lido segue com o que a busca em lote trouxe; o aviso conta quantos foram.
 */
export async function mesclarDetalhes(
  titulos: LegadoTituloResumo[],
  detalhar: (tituloId: string) => Promise<LegadoTituloDetalhe | null>,
  avisos: string[],
): Promise<LegadoTituloResumo[]> {
  const resultado = [...titulos];
  let semDetalhe = 0;
  for (let i = 0; i < titulos.length; i += DETALHES_EM_PARALELO) {
    await Promise.all(
      titulos.slice(i, i + DETALHES_EM_PARALELO).map(async (titulo, j) => {
        try {
          const d = await detalhar(titulo.tituloId);
          if (!d) {
            semDetalhe++;
            return;
          }
          resultado[i + j] = {
            ...titulo,
            tituloEstado: d.tituloEstado || titulo.tituloEstado,
            tituloObservacoes: d.tituloObservacoes ?? titulo.tituloObservacoes,
            boletoId: d.boletoId ?? null,
            boletoHash: d.boletoHash ?? null,
            remessaId: d.remessaId ?? null,
          };
        } catch {
          semDetalhe++;
        }
      }),
    );
  }
  if (semDetalhe > 0) {
    avisos.push(
      `${semDetalhe} título(s) sem o detalhe do legado — boleto e remessa não foram lidos para eles`,
    );
  }
  return resultado;
}

export async function gravarTitulosNaMatricula(
  matricula: { id: string },
  titulosLidos: LegadoTituloResumo[],
  usuarioId: string,
  avisos: string[],
  opcoes: {
    auditar?: boolean;
    /** Chamado para cada título que não pôde ser importado (ex.: sem vencimento válido). */
    aoIgnorar?: (titulo: LegadoTituloResumo, motivo: string) => void;
    /**
     * Lê o detalhe de um título (`titulo-informacoes/{id}`): a busca em lote não traz boleto nem
     * remessa. Sem isto, boleto/remessa ficam como estão. Falha de um título não impede os demais.
     */
    detalhar?: (tituloId: string) => Promise<LegadoTituloDetalhe | null>;
  } = {},
): Promise<{ novas: number; atualizadas: number }> {
  let titulos = titulosLidos;
  if (opcoes.detalhar) titulos = await mesclarDetalhes(titulos, opcoes.detalhar, avisos);
  const auditar = opcoes.auditar ?? true;
  let novas = 0;
  let atualizadas = 0;

  // Mapa por código normalizado (ver `normalizarCodTitulo`) — o legado
  // pode devolver o mesmo título com/sem zeros à esquerda em relação ao
  // que já está gravado (planilha antiga, digitação manual etc.); casar
  // só pelo `codTitulo` exato duplicaria a Parcela em vez de atualizar.
  const parcelasExistentesPorCodTitulo = new Map(
    (await financeiroRepository.listarTodasPorMatricula(matricula.id)).map((p) => [
      normalizarCodTitulo(p.codTitulo),
      p,
    ]),
  );

  for (const titulo of titulos) {
    const existente = parcelasExistentesPorCodTitulo.get(normalizarCodTitulo(titulo.tituloId));

    if (existente) {
      // Já existe — atualiza a situação de pagamento a partir do legado
      // (pedido do usuário, 2026-09-15), mesma regra da reconciliação:
      // nunca rebaixa um status avançado (ex.: PROTESTADO).
      const alteracoes = aplicarDetalheNaParcela(existente, titulo);
      if (alteracoes) {
        await financeiroRepository.update(existente.id, alteracoes);
        atualizadas++;
        if (auditar) {
          await registrarAuditoria({
            usuarioId,
            entidade: "Parcela",
            entidadeId: existente.id,
            acao: "ATUALIZACAO",
            detalhes: { origem: "importacao-legado", codTitulo: titulo.tituloId },
          });
        }
      }
      continue;
    }

    const vencimento = parseDataLegadoIso(titulo.tituloDataVencimento);
    if (!vencimento) {
      const motivo = "sem data de vencimento válida";
      avisos.push(
        `Título ${titulo.tituloId} (${titulo.tituloDescricao}) ${motivo} — não importado`,
      );
      opcoes.aoIgnorar?.(titulo, motivo);
      continue;
    }

    const status = statusLegadoParaEthos(titulo) ?? StatusParcela.EM_ABERTO;
    const dataPagto = parseDataLegadoQualquer(titulo.tituloDataPagamento);
    const dataBaixa = parseDataLegadoQualquer(titulo.tituloDataBaixa);
    // A baixa de um título cancelado/renegociado não é um pagamento.
    const baixaNaoEPagamento =
      status === StatusParcela.CANCELADO || status === StatusParcela.RENEGOCIADO;
    const dataPagamento = dataPagto ?? (baixaNaoEPagamento ? null : dataBaixa);

    const parcela = await financeiroRepository.create({
      matricula: { connect: { id: matricula.id } },
      codTitulo: titulo.tituloId,
      parcela: titulo.tituloParcela,
      vencimento,
      valor: titulo.tituloValor,
      tipoTitulo: titulo.tipoTituloNome ?? tipoTituloDaDescricao(titulo.tituloDescricao),
      status,
      valorPago: titulo.tituloValorPago || undefined,
      dataPagamento,
      // Decisão do usuário, 2026-09-15: Parcela importada do legado nunca
      // tem multa/juros calculados pelo Ethos — sempre usa os valores que
      // o próprio legado já calculou.
      multaLegado: titulo.multaCalc,
      jurosLegado: titulo.jurosCalc,
      totalLegado: titulo.totalCalc,
      // Campo estruturado de tipo de título do legado, confirmado ao vivo
      // em 2026-09-17 — guardado para exibição/conferência na Ficha de
      // Cobrança (ver Parcela.tipoTituloIdLegado no schema).
      tipoTituloIdLegado: titulo.tipoTituloId,
      tituloObservacoesLegado: titulo.tituloObservacoes,
      estadoLegado: titulo.tituloEstado.trim() || null,
      boletoLegadoId: titulo.boletoId ?? null,
      boletoLegadoHash: titulo.boletoHash ?? null,
      remessaLegadoId: titulo.remessaId ?? null,
      dataPagamentoLegado: dataPagto,
      dataBaixaLegado: dataBaixa,
    });
    novas++;
    if (auditar) {
      await registrarAuditoria({
        usuarioId,
        entidade: "Parcela",
        entidadeId: parcela.id,
        acao: "CRIACAO",
        detalhes: { origem: "importacao-legado", codTitulo: titulo.tituloId },
      });
    }
  }

  return { novas, atualizadas };
}

export const importacaoLegadoService = {
  /** Botão "Consultar CPF no legado" na tela de Aluno — só consulta, não grava nada. */
  async buscarPorCpf(cpfBruto: string): Promise<PreviaImportacaoLegado> {
    const cpf = normalizarCpf(cpfBruto);
    if (cpf.length !== 11) throw new ValidationError("CPF inválido");

    const client = await montarClient();
    const pessoaCursos = await client.buscarPessoaPorCpf(formatarCpf(cpf));

    if (pessoaCursos.length === 0) {
      return { encontrado: false, cpf, nome: "", alunoJaExiste: false, cursos: [] };
    }

    const { nome, pesId } = pessoaCursos[0];
    const alunoExistente = await alunosRepository.findByCpf(cpf);
    const titulosPorAlunocurso = agruparTitulosPorAlunocurso(
      await client.buscarTitulosPorPessoa(pesId),
    );

    const cursos: PreviaCursoLegado[] = [];
    for (const pessoaCurso of pessoaCursos) {
      const cursoEthos = await cursosRepository.findByNome(pessoaCurso.cursoNome);
      const matriculaExistente =
        alunoExistente && cursoEthos
          ? await matriculasRepository.findByAlunoECurso(alunoExistente.id, cursoEthos.id)
          : null;
      const parcelasExistentesPorCodTitulo = matriculaExistente
        ? new Map(
            (await financeiroRepository.listarTodasPorMatricula(matriculaExistente.id)).map((p) => [
              normalizarCodTitulo(p.codTitulo),
              p,
            ]),
          )
        : new Map<string, { status: StatusParcela }>();

      const titulos = titulosPorAlunocurso.get(pessoaCurso.alunocursoId) ?? [];
      cursos.push({
        alunocursoId: pessoaCurso.alunocursoId,
        cursoLegadoNome: pessoaCurso.cursoNome,
        cursoEthosSugerido: cursoEthos
          ? { id: cursoEthos.id, codigo: cursoEthos.codigo, nome: cursoEthos.nome }
          : null,
        matriculaJaExiste: !!matriculaExistente,
        parcelas: titulos.map((t) => {
          const existente = parcelasExistentesPorCodTitulo.get(normalizarCodTitulo(t.tituloId));
          return {
            tituloId: t.tituloId,
            descricao: t.tituloDescricao,
            parcela: t.tituloParcela,
            vencimento: t.tituloDataVencimento,
            valor: t.tituloValor,
            valorPago: t.tituloValorPago,
            estado: t.tituloEstado,
            diasAtraso: t.diasAtraso,
            tipoTitulo: t.tipoTituloNome ?? tipoTituloDaDescricao(t.tituloDescricao) ?? null,
            jaExisteNoEthos: !!existente,
            statusEthos: existente?.status ?? null,
            pagoNoLegado: statusLegadoParaEthos(t) === StatusParcela.PAGO,
          };
        }),
      });
    }

    return { encontrado: true, cpf, nome, alunoJaExiste: !!alunoExistente, cursos };
  },

  /**
   * Confirma a importação seguindo exatamente o que o usuário marcou na
   * pré-visualização (decisões do usuário, 2026-09-15):
   * - Curso cuja Matrícula ainda não existe no Ethos: só cria Aluno/Matrícula
   *   se `importarMatricula` vier marcado; caso contrário o curso inteiro é
   *   pulado (parcelas dele não são tocadas, mesmo que tenham sido
   *   selecionadas por engano no cliente — revalidado aqui, não só confiado
   *   no frontend).
   * - Títulos em `titulosSelecionados`: os que ainda não existem no Ethos
   *   são criados; os que já existem têm a situação de pagamento atualizada
   *   a partir do legado (mesma regra de `aplicarDetalheNaParcela` já usada
   *   na reconciliação — nunca rebaixa um status avançado como PROTESTADO).
   * Reconsulta o legado ao vivo (não confia em valores vindos do cliente)
   * para garantir dados financeiros atuais no momento da gravação.
   */
  async confirmarImportacao(input: ConfirmarImportacaoInput, usuarioId: string) {
    const cpf = normalizarCpf(input.cpf);
    if (cpf.length !== 11) throw new ValidationError("CPF inválido");

    const client = await montarClient();
    const pessoaCursos = await client.buscarPessoaPorCpf(formatarCpf(cpf));
    if (pessoaCursos.length === 0) {
      throw new NotFoundError("Pessoa não encontrada no sistema legado para este CPF");
    }

    const nome = pessoaCursos[0].nome;
    let aluno = await alunosRepository.findByCpf(cpf);
    let alunoCriado = false;
    const garantirAluno = async () => {
      if (aluno) return aluno;
      aluno = await alunosRepository.create({ cpf, nome });
      alunoCriado = true;
      await registrarAuditoria({
        usuarioId,
        entidade: "Aluno",
        entidadeId: aluno.id,
        acao: "CRIACAO",
        detalhes: { origem: "importacao-legado", cpf },
      });
      return aluno;
    };

    const situacaoPendente = await situacoesRepository.obterOuCriarPorNome(SITUACAO_PENDENTE, {
      cor: "#FAEEDA",
      ordem: 10,
      ativa: true,
      participaNovosRelatorios: true,
    });

    const titulosPorAlunocurso = agruparTitulosPorAlunocurso(
      await client.buscarTitulosPorPessoa(pessoaCursos[0].pesId),
    );

    let matriculasNovas = 0;
    let parcelasNovas = 0;
    let parcelasAtualizadas = 0;
    const avisos: string[] = [];

    for (const selecao of input.selecoes) {
      const pessoaCurso = pessoaCursos.find((pc) => pc.alunocursoId === selecao.alunocursoId);
      if (!pessoaCurso) {
        throw new ValidationError(
          `Curso ${selecao.alunocursoId} não veio na consulta do legado para este CPF — busque novamente`,
        );
      }

      const cursoEthos = await cursosRepository.findById(selecao.cursoEthosId);
      if (!cursoEthos) {
        throw new ValidationError(
          `Curso selecionado (${selecao.cursoEthosId}) não existe no Ethos`,
        );
      }

      let matricula = aluno
        ? await matriculasRepository.findByAlunoECurso(aluno.id, cursoEthos.id)
        : null;

      if (!matricula) {
        // Decisão do usuário, 2026-09-15: se aluno/matrícula ainda não
        // existem, só cria quando explicitamente marcado — e nesse caso as
        // parcelas do curso não são tocadas (mesmo se vieram selecionadas).
        if (!selecao.importarMatricula) {
          if (selecao.titulosSelecionados.length > 0) {
            avisos.push(
              `Curso "${pessoaCurso.cursoNome}": parcelas ignoradas porque a matrícula não foi marcada para importar`,
            );
          }
          continue;
        }

        const alunoAtual = await garantirAluno();
        matricula = await matriculasRepository.create({
          aluno: { connect: { id: alunoAtual.id } },
          curso: { connect: { id: cursoEthos.id } },
        });
        matriculasNovas++;
        await registrarAuditoria({
          usuarioId,
          entidade: "Matricula",
          entidadeId: matricula.id,
          acao: "CRIACAO",
          detalhes: { origem: "importacao-legado", cursoLegado: pessoaCurso.cursoNome },
        });
      }

      await garantirSituacaoPendente(matricula, situacaoPendente, usuarioId);

      if (selecao.titulosSelecionados.length === 0) continue;
      const titulosSelecionadosSet = new Set(selecao.titulosSelecionados);
      const titulos = (titulosPorAlunocurso.get(selecao.alunocursoId) ?? []).filter((t) =>
        titulosSelecionadosSet.has(t.tituloId),
      );

      const gravadas = await gravarTitulosNaMatricula(matricula, titulos, usuarioId, avisos, {
        detalhar: (id) => client.buscarInformacoesTitulo(id),
      });
      parcelasNovas += gravadas.novas;
      parcelasAtualizadas += gravadas.atualizadas;
    }

    return {
      alunoCriado,
      alunoId: aluno?.id ?? null,
      matriculasNovas,
      parcelasNovas,
      parcelasAtualizadas,
      avisos,
    };
  },
};
