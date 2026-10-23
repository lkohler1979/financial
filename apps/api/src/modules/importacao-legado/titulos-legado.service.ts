import { StatusParcela } from "@prisma/client";
import { NotFoundError } from "../../shared/errors/app-error";
import { formatarCpf } from "../../shared/utils/cpf";
import { alunosRepository } from "../alunos/alunos.repository";
import { financeiroRepository } from "../financeiro/financeiro.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import {
  parseDataLegadoIso,
  parseDataLegadoQualquer,
  type LegadoClient,
  type LegadoPessoaCurso,
  type LegadoTituloResumo,
} from "../sincronizacao-legado/legado-client";
import {
  dataPagamentoEfetiva,
  statusLegadoParaEthos,
  tipoTituloDaDescricao,
} from "../sincronizacao-legado/sincronizacao-legado.reconciliador";
import {
  gravarTitulosNaMatricula,
  mesclarDetalhes,
  normalizarCodTitulo,
} from "./importacao-legado.service";
import { titulosLegadoRepository } from "./titulos-legado.repository";

type ClienteTitulos = Pick<
  LegadoClient,
  "buscarPessoaPorCpf" | "buscarTitulosPorPessoa" | "buscarInformacoesTitulo"
>;
type Matricula = Awaited<ReturnType<typeof matriculasRepository.listarPorAluno>>[number];

export interface ResultadoTitulosDoAluno {
  /** A pessoa existe no legado (achada pelo CPF). */
  encontradoNoLegado: boolean;
  titulosNoLegado: number;
  /** Já estavam no Ethos (como parcela de uma matrícula). */
  jaImportados: number;
  /** Parcelas criadas em matrículas que o aluno já tem. */
  parcelasNovas: number;
  /** Títulos guardados sem matrícula (curso que o aluno não tem no Ethos, taxas avulsas…). */
  titulosSemMatricula: number;
  /** Sem data de vencimento válida: não foram gravados. */
  ignorados: number;
  avisos: string[];
}

/** Nome comparável: sem acento, caixa ou espaços repetidos. */
function normalizarNome(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Código do curso como o Ethos o guarda: sem zeros à esquerda ("000023000016" → "23000016"). */
function semZeros(valor: string): string {
  return valor.replace(/^0+(?=\d)/, "");
}

/**
 * A matrícula do aluno a que o título pertence: pelo curso da matrícula no legado (código do
 * curso) ou, na falta, pelo nome do curso. `undefined` = o aluno não tem esse curso no Ethos.
 */
function matriculaDoTitulo(
  titulo: LegadoTituloResumo,
  pessoaCursos: LegadoPessoaCurso[],
  matriculas: Matricula[],
): Matricula | undefined {
  const linha = pessoaCursos.find((l) => l.alunocursoId === titulo.alunocursoId);
  if (linha?.cursoId) {
    const codigo = semZeros(linha.cursoId);
    const porCodigo = matriculas.find((m) => m.curso.codigo === codigo);
    if (porCodigo) return porCodigo;
  }
  const nome = normalizarNome(titulo.cursoNome);
  return nome ? matriculas.find((m) => normalizarNome(m.curso.nome) === nome) : undefined;
}

/** Campos do título solto, no mesmo critério da parcela: o Estado do legado diz a situação. */
function dadosDoTituloSolto(titulo: LegadoTituloResumo) {
  const vencimento = parseDataLegadoIso(titulo.tituloDataVencimento);
  if (!vencimento) return null;
  const statusLegado = statusLegadoParaEthos(titulo);
  const dataPagto = parseDataLegadoQualquer(titulo.tituloDataPagamento);
  const dataBaixa = parseDataLegadoQualquer(titulo.tituloDataBaixa);
  return {
    parcela: titulo.tituloParcela,
    vencimento,
    valor: titulo.tituloValor,
    valorPago: titulo.tituloValorPago || null,
    tipoTitulo: titulo.tipoTituloNome ?? tipoTituloDaDescricao(titulo.tituloDescricao) ?? null,
    tipoTituloIdLegado: titulo.tipoTituloId,
    status: statusLegado ?? StatusParcela.EM_ABERTO,
    dataPagamento: dataPagamentoEfetiva(statusLegado, dataPagto, dataBaixa),
    descricaoLegado: titulo.tituloDescricao || null,
    cursoLegadoNome: titulo.cursoNome || null,
    alunocursoIdLegado: titulo.alunocursoId || null,
    estadoLegado: titulo.tituloEstado.trim() || null,
    multaLegado: titulo.multaCalc,
    jurosLegado: titulo.jurosCalc,
    totalLegado: titulo.totalCalc,
    descontoLegado: titulo.descontoCalc ?? null,
    boletoLegadoId: titulo.boletoId ?? null,
    boletoLegadoHash: titulo.boletoHash ?? null,
    remessaLegadoId: titulo.remessaId ?? null,
    dataPagamentoLegado: dataPagto,
    dataBaixaLegado: dataBaixa,
    tituloObservacoesLegado: titulo.tituloObservacoes,
  };
}

/**
 * Consulta no legado todos os títulos do aluno (pelo CPF) e grava só os que ainda não foram
 * importados:
 *  - título de um curso em que o aluno TEM matrícula no Ethos → vira parcela dessa matrícula;
 *  - título de qualquer outro curso (ou avulso) → fica guardado como `TituloLegado`, sem matrícula,
 *    e só aparece na tela de títulos do aluno.
 * Não cria aluno nem matrícula e não mexe no que já foi importado. Pode rodar de novo sem duplicar.
 */
export async function sincronizarTitulosDoAluno(
  aluno: { id: string; cpf: string },
  legado: ClienteTitulos,
  usuarioId: string,
): Promise<ResultadoTitulosDoAluno> {
  const resultado: ResultadoTitulosDoAluno = {
    encontradoNoLegado: false,
    titulosNoLegado: 0,
    jaImportados: 0,
    parcelasNovas: 0,
    titulosSemMatricula: 0,
    ignorados: 0,
    avisos: [],
  };

  const pessoaCursos = await legado.buscarPessoaPorCpf(formatarCpf(aluno.cpf));
  if (pessoaCursos.length === 0) return resultado;
  resultado.encontradoNoLegado = true;

  const titulos = await legado.buscarTitulosPorPessoa(pessoaCursos[0].pesId);
  resultado.titulosNoLegado = titulos.length;

  const [matriculas, codigos] = await Promise.all([
    matriculasRepository.listarPorAluno(aluno.id),
    financeiroRepository.codTitulosDoAluno(aluno.id),
  ]);
  const importados = new Set(codigos.map(normalizarCodTitulo));
  const faltantes = titulos.filter((t) => !importados.has(normalizarCodTitulo(t.tituloId)));
  resultado.jaImportados = titulos.length - faltantes.length;

  const porMatricula = new Map<string, { matricula: Matricula; titulos: LegadoTituloResumo[] }>();
  const semMatricula: LegadoTituloResumo[] = [];
  for (const titulo of faltantes) {
    const matricula = matriculaDoTitulo(titulo, pessoaCursos, matriculas);
    if (!matricula) {
      semMatricula.push(titulo);
      continue;
    }
    const grupo = porMatricula.get(matricula.id) ?? { matricula, titulos: [] };
    grupo.titulos.push(titulo);
    porMatricula.set(matricula.id, grupo);
  }

  const detalhar = (id: string) => legado.buscarInformacoesTitulo(id);

  for (const { matricula, titulos: doCurso } of porMatricula.values()) {
    const gravadas = await gravarTitulosNaMatricula(
      matricula,
      doCurso,
      usuarioId,
      resultado.avisos,
      {
        auditar: false,
        detalhar,
        aoIgnorar: () => {
          resultado.ignorados += 1;
        },
      },
    );
    resultado.parcelasNovas += gravadas.novas;
    // Um título que estava solto e agora é parcela deixa de existir como solto.
    await titulosLegadoRepository.apagarPorCodigos(
      aluno.id,
      doCurso.map((t) => t.tituloId),
    );
  }

  if (semMatricula.length > 0) {
    const completos = await mesclarDetalhes(semMatricula, detalhar, resultado.avisos);
    for (const titulo of completos) {
      const dados = dadosDoTituloSolto(titulo);
      if (!dados) {
        resultado.ignorados += 1;
        continue;
      }
      await titulosLegadoRepository.gravar(aluno.id, titulo.tituloId, dados);
      resultado.titulosSemMatricula += 1;
    }
  }

  return resultado;
}

/**
 * Todos os títulos de um aluno (por CPF): as parcelas de todas as matrículas e os títulos
 * guardados sem matrícula. É a base da tela "Títulos do aluno"; a ficha de cobrança de uma
 * matrícula continua mostrando só as parcelas dela.
 */
export async function listarTitulosDoAluno(alunoId: string) {
  const aluno = await alunosRepository.findById(alunoId);
  if (!aluno) throw new NotFoundError("Aluno não encontrado");

  const [parcelas, soltos] = await Promise.all([
    financeiroRepository.listarDoAluno(alunoId),
    titulosLegadoRepository.listarDoAluno(alunoId),
  ]);
  const comoParcela = new Set(parcelas.map((p) => normalizarCodTitulo(p.codTitulo)));

  const titulos = [
    ...parcelas.map((p) => ({ ...p, origem: "MATRICULA" as const })),
    ...soltos
      .filter((t) => !comoParcela.has(normalizarCodTitulo(t.codTitulo)))
      .map((t) => ({ ...t, origem: "SEM_MATRICULA" as const, matricula: null })),
  ].sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());

  return { aluno: { id: aluno.id, nome: aluno.nome, cpf: aluno.cpf }, titulos };
}
