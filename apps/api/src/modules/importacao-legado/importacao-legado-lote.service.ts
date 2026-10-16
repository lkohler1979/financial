import { StatusLoteLegado } from "@prisma/client";
import { importacaoLegadoLoteQueue } from "../../jobs/queues/importacao-legado-lote.queue";
import { ConflictError } from "../../shared/errors/app-error";
import { normalizarCpf } from "../../shared/utils/cpf";
import { alunosRepository } from "../alunos/alunos.repository";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { situacoesRepository } from "../cobranca/situacoes.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import type { LegadoClient, LegadoPessoaCurso, LegadoTituloResumo } from "../sincronizacao-legado/legado-client";
import { varrerPessoasDoLegado } from "../sincronizacao-legado/legado-varredura";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";
import { importacaoLegadoLoteRepository as repo } from "./importacao-legado-lote.repository";
import { garantirSituacaoPendente, gravarTitulosNaMatricula } from "./importacao-legado.service";

type ClienteLegado = Pick<LegadoClient, "buscarPessoasPorPrefixoNome" | "buscarTitulosPorPessoa">;

/** Lote sem atividade há mais que isto é considerado interrompido (worker caiu) e não bloqueia um novo. */
const LOTE_PARADO_APOS_MS = 10 * 60_000;
/** A cada quantas pessoas/consultas o andamento é gravado para a tela. */
const GRAVAR_A_CADA = 10;
const MAX_ERROS_DETALHADOS = 50;

interface Totais {
  pessoasProcessadas: number;
  semCpf: number;
  alunosCriados: number;
  matriculasNovas: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: number;
}

const SITUACAO_PENDENTE = { cor: "#FAEEDA", ordem: 10, ativa: true, participaNovosRelatorios: true };

function agruparPorAlunocurso(titulos: LegadoTituloResumo[]): Map<string, LegadoTituloResumo[]> {
  const mapa = new Map<string, LegadoTituloResumo[]>();
  for (const titulo of titulos) {
    const lista = mapa.get(titulo.alunocursoId) ?? [];
    lista.push(titulo);
    mapa.set(titulo.alunocursoId, lista);
  }
  return mapa;
}

export const importacaoLegadoLoteService = {
  /** Cria o lote e o enfileira; a varredura e a importação rodam no worker. */
  async iniciar(usuarioId: string, limite?: number) {
    const ativo = await repo.emAndamento(new Date(Date.now() - LOTE_PARADO_APOS_MS));
    if (ativo) throw new ConflictError("Já existe uma busca em lote em andamento — aguarde terminar");

    const lote = await repo.criar(usuarioId, limite);
    await importacaoLegadoLoteQueue.add("importar-lote", { loteId: lote.id, usuarioId });
    return lote;
  },

  ultimo() {
    return repo.ultimo();
  },

  /**
   * Varre o legado inteiro e importa cada pessoa: aluno (se ainda não existe), matrícula e parcelas
   * dos cursos cujo NOME bate com um curso do Ethos. Curso sem correspondência é ignorado e
   * contado em `cursosSemCorrespondencia` (cadastre o curso e rode de novo — a importação é
   * idempotente: parcelas existentes só têm a situação de pagamento atualizada).
   */
  async executar(loteId: string, usuarioId: string, cliente?: ClienteLegado) {
    const totais: Totais = {
      pessoasProcessadas: 0,
      semCpf: 0,
      alunosCriados: 0,
      matriculasNovas: 0,
      parcelasNovas: 0,
      parcelasAtualizadas: 0,
      erros: 0,
    };
    const cursosSemCorrespondencia: Record<string, number> = {};
    const errosDetalhados: string[] = [];
    let truncados: string[] = [];

    try {
      const lote = await repo.findById(loteId);
      if (!lote) return;
      const legado = cliente ?? (await montarClient());

      // 1) Varredura: lista todas as pessoas pelo prefixo do nome.
      let consultas = 0;
      const varredura = await varrerPessoasDoLegado((prefixo) => legado.buscarPessoasPorPrefixoNome(prefixo), {
        limite: lote.limite ?? undefined,
        onProgresso: async (p) => {
          consultas = p.consultas;
          if (p.consultas % GRAVAR_A_CADA === 0) {
            await repo.atualizar(loteId, { consultas: p.consultas, pessoasEncontradas: p.pessoas });
          }
        },
      });
      truncados = varredura.truncados;
      const pessoas = [...varredura.pessoas.entries()].slice(0, lote.limite ?? undefined);
      await repo.atualizar(loteId, {
        status: StatusLoteLegado.IMPORTANDO,
        consultas,
        pessoasEncontradas: pessoas.length,
      });

      // 2) Importação pessoa a pessoa.
      const situacaoPendente = await situacoesRepository.obterOuCriarPorNome("PENDENTE", SITUACAO_PENDENTE);
      const cursosPorNome = new Map<string, Awaited<ReturnType<typeof cursosRepository.findByNome>>>();

      for (const [pesId, linhas] of pessoas) {
        try {
          await this.importarPessoa(legado, pesId, linhas, {
            usuarioId,
            situacaoPendente,
            cursosPorNome,
            totais,
            cursosSemCorrespondencia,
          });
        } catch (erro) {
          totais.erros += 1;
          if (errosDetalhados.length < MAX_ERROS_DETALHADOS) {
            errosDetalhados.push(`${linhas[0]?.nome ?? pesId}: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
          }
        }
        totais.pessoasProcessadas += 1;
        if (totais.pessoasProcessadas % GRAVAR_A_CADA === 0) await repo.atualizar(loteId, { ...totais });
      }

      await repo.atualizar(loteId, {
        ...totais,
        status: StatusLoteLegado.CONCLUIDO,
        finalizadoEm: new Date(),
        cursosSemCorrespondencia,
        detalhes: { erros: errosDetalhados, prefixosTruncados: truncados },
      });
      await registrarAuditoria({
        usuarioId,
        entidade: "ImportacaoLegadoLote",
        entidadeId: loteId,
        acao: "CRIACAO",
        detalhes: { ...totais, cursosSemCorrespondencia: Object.keys(cursosSemCorrespondencia).length },
      });
    } catch (erro) {
      // Qualquer falha (inclusive logo no início) tira o lote de "em andamento" — senão a tela
      // ficaria esperando para sempre.
      try {
        await repo.atualizar(loteId, {
          ...totais,
          status: StatusLoteLegado.FALHOU,
          finalizadoEm: new Date(),
          mensagemFalha: (erro instanceof Error ? erro.message : "Erro desconhecido").slice(0, 500),
          cursosSemCorrespondencia,
          detalhes: { erros: errosDetalhados, prefixosTruncados: truncados },
        });
      } catch {
        // Sem banco não há como registrar a falha; o erro original sobe abaixo.
      }
      throw erro;
    }
  },

  /** Importa uma pessoa do legado: aluno, matrículas e parcelas dos cursos que existem no Ethos. */
  async importarPessoa(
    legado: ClienteLegado,
    pesId: string,
    linhas: LegadoPessoaCurso[],
    ctx: {
      usuarioId: string;
      situacaoPendente: { id: string; nome: string };
      cursosPorNome: Map<string, Awaited<ReturnType<typeof cursosRepository.findByNome>>>;
      totais: Totais;
      cursosSemCorrespondencia: Record<string, number>;
    },
  ) {
    const cpf = normalizarCpf(linhas[0]?.cpf ?? "");
    if (cpf.length !== 11) {
      // Pessoa jurídica ou cadastro sem CPF: o Ethos identifica o aluno pelo CPF.
      ctx.totais.semCpf += 1;
      return;
    }

    // Só quem tem ao menos um curso conhecido entra no Ethos (evita alunos "órfãos").
    const casados: { linha: LegadoPessoaCurso; cursoId: string }[] = [];
    for (const linha of linhas) {
      const chave = linha.cursoNome.trim().toLowerCase();
      if (!ctx.cursosPorNome.has(chave)) ctx.cursosPorNome.set(chave, await cursosRepository.findByNome(linha.cursoNome));
      const curso = ctx.cursosPorNome.get(chave);
      if (curso) casados.push({ linha, cursoId: curso.id });
      else ctx.cursosSemCorrespondencia[linha.cursoNome] = (ctx.cursosSemCorrespondencia[linha.cursoNome] ?? 0) + 1;
    }
    if (casados.length === 0) return;

    let aluno = await alunosRepository.findByCpf(cpf);
    if (!aluno) {
      aluno = await alunosRepository.create({ cpf, nome: linhas[0].nome });
      ctx.totais.alunosCriados += 1;
    }

    const titulosPorAlunocurso = agruparPorAlunocurso(await legado.buscarTitulosPorPessoa(pesId));
    for (const { linha, cursoId } of casados) {
      let matricula = await matriculasRepository.findByAlunoECurso(aluno.id, cursoId);
      if (!matricula) {
        matricula = await matriculasRepository.create({
          aluno: { connect: { id: aluno.id } },
          curso: { connect: { id: cursoId } },
        });
        ctx.totais.matriculasNovas += 1;
      }
      await garantirSituacaoPendente(matricula, ctx.situacaoPendente, ctx.usuarioId);

      const avisos: string[] = [];
      const gravadas = await gravarTitulosNaMatricula(
        matricula,
        titulosPorAlunocurso.get(linha.alunocursoId) ?? [],
        ctx.usuarioId,
        avisos,
        { auditar: false },
      );
      ctx.totais.parcelasNovas += gravadas.novas;
      ctx.totais.parcelasAtualizadas += gravadas.atualizadas;
    }
  },
};
