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
import { parseDataLegadoIso, type LegadoTituloResumo } from "../sincronizacao-legado/legado-client";
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

function agruparTitulosPorAlunocurso(titulos: LegadoTituloResumo[]): Map<string, LegadoTituloResumo[]> {
  const mapa = new Map<string, LegadoTituloResumo[]>();
  for (const titulo of titulos) {
    const lista = mapa.get(titulo.alunocursoId) ?? [];
    lista.push(titulo);
    mapa.set(titulo.alunocursoId, lista);
  }
  return mapa;
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
    const titulosPorAlunocurso = agruparTitulosPorAlunocurso(await client.buscarTitulosPorPessoa(pesId));

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
        throw new ValidationError(`Curso selecionado (${selecao.cursoEthosId}) não existe no Ethos`);
      }

      let matricula = aluno ? await matriculasRepository.findByAlunoECurso(aluno.id, cursoEthos.id) : null;

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

      // Decisão do usuário, 2026-07-09 (mesma regra de importacao.processor.ts):
      // matrícula sem situação de cobrança definida entra como "Pendente" —
      // nunca sobrescreve uma situação já atribuída manualmente.
      if (!matricula.situacaoCobrancaId) {
        await matriculasRepository.update(matricula.id, {
          situacaoCobranca: { connect: { id: situacaoPendente.id } },
        });
        await historicoRepository.registrar(
          matricula.id,
          usuarioId,
          `Situação alterada para "${situacaoPendente.nome}" (importação do sistema legado)`,
        );
      }

      if (selecao.titulosSelecionados.length === 0) continue;
      const titulosSelecionadosSet = new Set(selecao.titulosSelecionados);
      const titulos = (titulosPorAlunocurso.get(selecao.alunocursoId) ?? []).filter((t) =>
        titulosSelecionadosSet.has(t.tituloId),
      );

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
            parcelasAtualizadas++;
            await registrarAuditoria({
              usuarioId,
              entidade: "Parcela",
              entidadeId: existente.id,
              acao: "ATUALIZACAO",
              detalhes: { origem: "importacao-legado", codTitulo: titulo.tituloId },
            });
          }
          continue;
        }

        const vencimento = parseDataLegadoIso(titulo.tituloDataVencimento);
        if (!vencimento) {
          avisos.push(`Título ${titulo.tituloId} (${titulo.tituloDescricao}) sem data de vencimento válida — não importado`);
          continue;
        }

        const status = statusLegadoParaEthos(titulo) ?? StatusParcela.EM_ABERTO;
        const dataPagamento = parseDataLegadoIso(titulo.tituloDataPagamento ?? titulo.tituloDataBaixa);

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
        });
        parcelasNovas++;
        await registrarAuditoria({
          usuarioId,
          entidade: "Parcela",
          entidadeId: parcela.id,
          acao: "CRIACAO",
          detalhes: { origem: "importacao-legado", codTitulo: titulo.tituloId },
        });
      }
    }

    return { alunoCriado, alunoId: aluno?.id ?? null, matriculasNovas, parcelasNovas, parcelasAtualizadas, avisos };
  },
};
