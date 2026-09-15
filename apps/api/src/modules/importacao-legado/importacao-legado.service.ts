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
import { statusLegadoParaEthos, tipoTituloDaDescricao } from "../sincronizacao-legado/sincronizacao-legado.reconciliador";
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
  jaExisteNoEthos: boolean;
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
      const codTitulosExistentes = matriculaExistente
        ? new Set((await financeiroRepository.listarTodasPorMatricula(matriculaExistente.id)).map((p) => p.codTitulo))
        : new Set<string>();

      const titulos = titulosPorAlunocurso.get(pessoaCurso.alunocursoId) ?? [];
      cursos.push({
        alunocursoId: pessoaCurso.alunocursoId,
        cursoLegadoNome: pessoaCurso.cursoNome,
        cursoEthosSugerido: cursoEthos
          ? { id: cursoEthos.id, codigo: cursoEthos.codigo, nome: cursoEthos.nome }
          : null,
        matriculaJaExiste: !!matriculaExistente,
        parcelas: titulos.map((t) => ({
          tituloId: t.tituloId,
          descricao: t.tituloDescricao,
          parcela: t.tituloParcela,
          vencimento: t.tituloDataVencimento,
          valor: t.tituloValor,
          valorPago: t.tituloValorPago,
          estado: t.tituloEstado,
          diasAtraso: t.diasAtraso,
          jaExisteNoEthos: codTitulosExistentes.has(t.tituloId),
        })),
      });
    }

    return { encontrado: true, cpf, nome, alunoJaExiste: !!alunoExistente, cursos };
  },

  /**
   * Confirma a importação: cria o Aluno se ainda não existir, e para cada
   * curso selecionado cria a Matrícula (se ainda não existir) e as Parcelas
   * que ainda não existem no Ethos — nunca sobrescreve o que já existe
   * (decisão do usuário, 2026-09-15: "importar o que falta", mesmo espírito
   * append-first do CLAUDE.md seção 5). Reconsulta o legado ao vivo (não
   * confia em valores vindos do cliente) para garantir dados financeiros
   * atuais no momento da gravação.
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
    if (!aluno) {
      aluno = await alunosRepository.create({ cpf, nome });
      alunoCriado = true;
      await registrarAuditoria({
        usuarioId,
        entidade: "Aluno",
        entidadeId: aluno.id,
        acao: "CRIACAO",
        detalhes: { origem: "importacao-legado", cpf },
      });
    }

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

      let matricula = await matriculasRepository.findByAlunoECurso(aluno.id, cursoEthos.id);
      if (!matricula) {
        matricula = await matriculasRepository.create({
          aluno: { connect: { id: aluno.id } },
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

      const titulos = titulosPorAlunocurso.get(selecao.alunocursoId) ?? [];
      for (const titulo of titulos) {
        const existente = await financeiroRepository.findByChaveNatural(matricula.id, titulo.tituloId);
        if (existente) continue; // já existe — importação nunca sobrescreve (CLAUDE.md seção 5)

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
          tipoTitulo: tipoTituloDaDescricao(titulo.tituloDescricao),
          status,
          valorPago: titulo.tituloValorPago || undefined,
          dataPagamento,
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

    return { alunoCriado, alunoId: aluno.id, matriculasNovas, parcelasNovas, avisos };
  },
};
