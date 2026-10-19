import { StatusLoteLegado, TipoOcorrenciaLote } from "@prisma/client";
import { importacaoLegadoLoteQueue } from "../../jobs/queues/importacao-legado-lote.queue";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error";
import { formatarCpf, normalizarCpf } from "../../shared/utils/cpf";
import { alunosRepository } from "../alunos/alunos.repository";
import { registrarAuditoria } from "../auditoria/auditoria.service";
import { situacoesRepository } from "../cobranca/situacoes.repository";
import { cursosRepository } from "../cursos/cursos.repository";
import { matriculasRepository } from "../matriculas/matriculas.repository";
import type {
  LegadoClient,
  LegadoPessoaCurso,
  LegadoTituloResumo,
} from "../sincronizacao-legado/legado-client";
import { varrerPessoasDoLegado } from "../sincronizacao-legado/legado-varredura";
import { montarClient } from "../sincronizacao-legado/sincronizacao-legado.service";
import {
  importacaoLegadoLoteRepository as repo,
  type NovaOcorrencia,
} from "./importacao-legado-lote.repository";
import { garantirSituacaoPendente, gravarTitulosNaMatricula } from "./importacao-legado.service";
import { montarRelatorioLote } from "./importacao-legado-lote.relatorio";

type ClienteLegado = Pick<LegadoClient, "buscarPessoasPorPrefixoNome" | "buscarTitulosPorPessoa">;
type Curso = NonNullable<Awaited<ReturnType<typeof cursosRepository.findByNome>>>;

/** Lote sem atividade há mais que isto é considerado interrompido (worker caiu) e não bloqueia um novo. */
const LOTE_PARADO_APOS_MS = 10 * 60_000;
/** A cada quantas pessoas/consultas o andamento é gravado para a tela. */
const GRAVAR_A_CADA = 10;
/** A cada quantas pessoas as ocorrências acumuladas vão para o banco. */
const DESCARGA_OCORRENCIAS_A_CADA = 200;

export interface Totais {
  pessoasProcessadas: number;
  semCpf: number;
  alunosCriados: number;
  matriculasNovas: number;
  cursosCriados: number;
  parcelasNovas: number;
  parcelasAtualizadas: number;
  erros: number;
}

interface Contexto {
  usuarioId: string;
  situacaoPendente: { id: string; nome: string };
  cursos: Map<string, Curso>;
  /** Oferta do curso (`cursocampus_id`) → curso, aprendido nas linhas de todas as pessoas. */
  cursosPorCampus: Map<string, { cursoId: string; cursoNome: string; cursoSigla: string }>;
  totais: Totais;
  ocorrencias: NovaOcorrencia[];
}

const SITUACAO_PENDENTE = {
  cor: "#FAEEDA",
  ordem: 10,
  ativa: true,
  participaNovosRelatorios: true,
};

/** Nome de curso comparável: sem acento, caixa ou espaços repetidos. */
function normalizarNome(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Código do curso como a planilha o guardou: sem zeros à esquerda ("00000000111" → "111"). */
function semZeros(valor: string): string {
  return valor.replace(/^0+(?=\d)/, "");
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : "erro desconhecido";
}

const MOTIVO_SEM_ATIVIDADE =
  "A busca parou de responder (provavelmente o servidor foi reiniciado). Rode novamente: o que já foi importado não é duplicado.";
const MOTIVO_REINICIO =
  "O servidor foi reiniciado durante a busca. Rode novamente: o que já foi importado não é duplicado.";

export const importacaoLegadoLoteService = {
  /** Libera lotes que ficaram "em andamento" sem nenhum worker rodando (ex.: deploy no meio). */
  async liberarInterrompidos(): Promise<number> {
    return repo.marcarInterrompidos(
      MOTIVO_SEM_ATIVIDADE,
      new Date(Date.now() - LOTE_PARADO_APOS_MS),
    );
  },

  /** Chamado quando o worker sobe ou recebe sinal de parada: nenhum lote pode continuar "rodando". */
  async marcarInterrompidosPorReinicio(): Promise<number> {
    return repo.marcarInterrompidos(MOTIVO_REINICIO);
  },
  /** Cria o lote e o enfileira; a varredura e a importação rodam no worker. */
  async iniciar(usuarioId: string, limite?: number) {
    await this.liberarInterrompidos();
    const ativo = await repo.emAndamento(new Date(Date.now() - LOTE_PARADO_APOS_MS));
    if (ativo)
      throw new ConflictError("Já existe uma busca em lote em andamento — aguarde terminar");

    const lote = await repo.criar(usuarioId, limite);
    await importacaoLegadoLoteQueue.add("importar-lote", { loteId: lote.id, usuarioId });
    return lote;
  },

  /** Último lote com a contagem de ocorrências por tipo (para a tela e o relatório). */
  async ultimo() {
    await this.liberarInterrompidos();
    const lote = await repo.ultimo();
    if (!lote) return null;
    return { ...lote, ocorrenciasPorTipo: await repo.contarOcorrenciasPorTipo(lote.id) };
  },

  /** Relatório do lote (Excel) com tudo que não entrou ou entrou com ressalva. `atual` = o último. */
  async relatorio(loteId: string) {
    const lote = loteId === "atual" ? await repo.ultimo() : await repo.findById(loteId);
    if (!lote) throw new NotFoundError("Nenhuma busca em lote encontrada");
    const ocorrencias = await repo.listarOcorrencias(lote.id);
    return {
      arquivo: montarRelatorioLote(lote, ocorrencias),
      nome: `importacao-legado-${lote.id.slice(0, 8)}.xlsx`,
    };
  },

  /**
   * Varre o legado inteiro e importa cada pessoa: aluno (se tiver CPF), matrículas e parcelas.
   * Curso do legado que não existe no Ethos é criado na hora (código = id do curso no legado).
   * Tudo que não entra — pessoa sem CPF, matrícula, parcela, erro — vai para o relatório do lote.
   * A importação é idempotente: o que já existe só é atualizado.
   */
  async executar(loteId: string, usuarioId: string, cliente?: ClienteLegado) {
    const totais: Totais = {
      pessoasProcessadas: 0,
      semCpf: 0,
      alunosCriados: 0,
      matriculasNovas: 0,
      cursosCriados: 0,
      parcelasNovas: 0,
      parcelasAtualizadas: 0,
      erros: 0,
    };
    const ocorrencias: NovaOcorrencia[] = [];
    const descarregar = async () => {
      if (ocorrencias.length === 0) return;
      await repo.registrarOcorrencias(loteId, ocorrencias.splice(0, ocorrencias.length));
    };

    try {
      const lote = await repo.findById(loteId);
      if (!lote) return;
      const legado = cliente ?? (await montarClient());

      // 1) Varredura: lista todas as pessoas pelo prefixo do nome.
      let consultas = 0;
      const varredura = await varrerPessoasDoLegado(
        (prefixo) => legado.buscarPessoasPorPrefixoNome(prefixo),
        {
          limite: lote.limite ?? undefined,
          onProgresso: async (p) => {
            consultas = p.consultas;
            if (p.consultas % GRAVAR_A_CADA === 0) {
              await repo.atualizar(loteId, {
                consultas: p.consultas,
                pessoasEncontradas: p.pessoas,
              });
            }
          },
        },
      );
      for (const prefixo of varredura.truncados) {
        ocorrencias.push({
          tipo: TipoOcorrenciaLote.VARREDURA_INCOMPLETA,
          motivo: `A busca pelo prefixo "${prefixo}" continuou cheia na profundidade máxima — pode haver pessoas fora da lista`,
        });
      }
      const pessoas = [...varredura.pessoas.entries()].slice(0, lote.limite ?? undefined);
      await repo.atualizar(loteId, {
        status: StatusLoteLegado.IMPORTANDO,
        consultas,
        pessoasEncontradas: pessoas.length,
      });

      // 2) Importação pessoa a pessoa.
      const situacaoPendente = await situacoesRepository.obterOuCriarPorNome(
        "PENDENTE",
        SITUACAO_PENDENTE,
      );
      // Os títulos só trazem a oferta do curso; o código do curso vem das linhas das pessoas.
      const cursosPorCampus: Contexto["cursosPorCampus"] = new Map();
      for (const [, linhas] of pessoas) {
        for (const l of linhas) {
          if (l.cursocampusId && l.cursoId && !cursosPorCampus.has(l.cursocampusId)) {
            cursosPorCampus.set(l.cursocampusId, {
              cursoId: l.cursoId,
              cursoNome: l.cursoNome,
              cursoSigla: l.cursoSigla,
            });
          }
        }
      }
      const ctx: Contexto = {
        usuarioId,
        situacaoPendente,
        cursos: new Map(),
        cursosPorCampus,
        totais,
        ocorrencias,
      };

      for (const [pesId, linhas] of pessoas) {
        try {
          await this.importarPessoa(legado, pesId, linhas, ctx);
        } catch (erro) {
          totais.erros += 1;
          ocorrencias.push({
            tipo: TipoOcorrenciaLote.ERRO,
            pessoaNome: linhas[0]?.nome,
            cpf: normalizarCpf(linhas[0]?.cpf ?? "") || null,
            pesId,
            motivo: mensagemDe(erro),
          });
        }
        totais.pessoasProcessadas += 1;
        if (totais.pessoasProcessadas % GRAVAR_A_CADA === 0) {
          await repo.atualizar(loteId, { ...totais });
        }
        if (totais.pessoasProcessadas % DESCARGA_OCORRENCIAS_A_CADA === 0) await descarregar();
      }

      await descarregar();
      await repo.atualizar(loteId, {
        ...totais,
        status: StatusLoteLegado.CONCLUIDO,
        finalizadoEm: new Date(),
      });
      await registrarAuditoria({
        usuarioId,
        entidade: "ImportacaoLegadoLote",
        entidadeId: loteId,
        acao: "CRIACAO",
        detalhes: { ...totais },
      });
    } catch (erro) {
      // Qualquer falha (inclusive logo no início) tira o lote de "em andamento" — senão a tela
      // ficaria esperando para sempre.
      try {
        await descarregar();
        await repo.atualizar(loteId, {
          ...totais,
          status: StatusLoteLegado.FALHOU,
          finalizadoEm: new Date(),
          mensagemFalha: mensagemDe(erro).slice(0, 500),
        });
      } catch {
        // Sem banco não há como registrar a falha; o erro original sobe abaixo.
      }
      throw erro;
    }
  },

  /** Procura o curso pelo código (= id no legado), depois pelo nome; se não existe, cria. */
  async resolverCurso(linha: LegadoPessoaCurso, ctx: Contexto): Promise<Curso> {
    const codigo = semZeros(linha.cursoId);
    const chave = codigo;
    const emCache = ctx.cursos.get(chave);
    if (emCache) return emCache;

    let curso =
      (await cursosRepository.findByCodigo(codigo)) ??
      (linha.cursoNome.trim() ? await cursosRepository.findByNome(linha.cursoNome) : null);

    if (!curso) {
      const nome = linha.cursoNome.trim() || `Curso ${linha.cursoId} (sem nome no legado)`;
      curso = await cursosRepository.create({
        codigo,
        nome,
        situacao: true,
        observacoes: `Criado automaticamente na importação do legado${linha.cursoSigla ? ` (sigla ${linha.cursoSigla})` : ""}. Complete valor padrão e nível de ensino.`,
      });
      ctx.totais.cursosCriados += 1;
      ctx.ocorrencias.push({
        tipo: TipoOcorrenciaLote.CURSO_CRIADO,
        curso: nome,
        motivo: `Curso não existia no Ethos — criado com o código ${codigo} do legado; falta valor padrão e nível de ensino`,
      });
    }
    ctx.cursos.set(chave, curso);
    return curso;
  },

  /** Importa uma pessoa do legado: aluno, matrículas e parcelas — registrando o que ficar de fora. */
  async importarPessoa(
    legado: ClienteLegado,
    pesId: string,
    linhas: LegadoPessoaCurso[],
    ctx: Contexto,
  ) {
    const principal = linhas[0];
    const cpf = normalizarCpf(principal?.cpf ?? "");
    // Linha com curso = matrícula de verdade; sem curso é só o cadastro da pessoa.
    const comCurso = linhas.filter((l) => l.alunocursoId && l.cursoId);
    const referencia = { pessoaNome: principal?.nome, cpf: cpf || null, pesId };

    if (cpf.length !== 11) {
      // Pessoa jurídica ou cadastro sem CPF: o Ethos identifica o aluno pelo CPF.
      ctx.totais.semCpf += 1;
      ctx.ocorrencias.push({
        tipo: TipoOcorrenciaLote.ALUNO_SEM_CPF,
        ...referencia,
        motivo: "Pessoa sem CPF válido no legado (CPF ausente ou cadastro de empresa)",
      });
      for (const linha of comCurso) {
        ctx.ocorrencias.push({
          tipo: TipoOcorrenciaLote.MATRICULA_NAO_REALIZADA,
          ...referencia,
          curso: linha.cursoNome || linha.cursoId,
          motivo: "Aluno sem CPF — matrícula e parcelas não importadas",
        });
      }
      return;
    }

    let aluno = await alunosRepository.findByCpf(cpf);
    if (!aluno) {
      aluno = await alunosRepository.create({ cpf, nome: principal.nome });
      ctx.totais.alunosCriados += 1;
    }

    if (comCurso.length === 0) {
      ctx.ocorrencias.push({
        tipo: TipoOcorrenciaLote.ALUNO_SEM_MATRICULA,
        ...referencia,
        cpf: formatarCpf(cpf),
        motivo:
          "Pessoa cadastrada no legado sem nenhuma matrícula — aluno criado sem matrícula nem parcelas",
      });
      return;
    }

    // A busca do legado devolve UMA linha por curso, mas o aluno pode ter mais de uma matrícula no
    // mesmo curso (planos diferentes): os títulos da outra matrícula não casam pelo id da
    // matrícula, então caem no curso de mesmo nome.
    const titulos = await legado.buscarTitulosPorPessoa(pesId);
    // A busca por pessoa também só traz o 1º curso: os demais aparecem apenas nos títulos.
    const cursosDaPessoa = [...comCurso];
    for (const t of titulos) {
      if (!t.alunocursoId) continue;
      const jaTem = cursosDaPessoa.some(
        (l) =>
          l.alunocursoId === t.alunocursoId ||
          (t.cursocampusId !== "" && l.cursocampusId === t.cursocampusId) ||
          normalizarNome(l.cursoNome) === normalizarNome(t.cursoNome),
      );
      if (jaTem) continue;
      const conhecido = ctx.cursosPorCampus.get(t.cursocampusId);
      const cursoId =
        conhecido?.cursoId ?? (t.cursocampusId ? `CC-${semZeros(t.cursocampusId)}` : "");
      if (!cursoId) continue;
      cursosDaPessoa.push({
        pesId,
        alunoId: principal.alunoId,
        nome: principal.nome,
        cpf: principal.cpf,
        alunocursoId: t.alunocursoId,
        alunocursoSituacao: "",
        cursoId,
        cursoNome: conhecido?.cursoNome ?? t.cursoNome,
        cursoSigla: conhecido?.cursoSigla ?? t.cursoSigla,
        cursocampusId: t.cursocampusId,
      });
    }

    const porAlunocurso = new Map(cursosDaPessoa.map((l) => [l.alunocursoId, l]));
    const porNomeCurso = new Map<string, LegadoPessoaCurso>();
    for (const l of cursosDaPessoa) {
      const nome = normalizarNome(l.cursoNome);
      if (nome && !porNomeCurso.has(nome)) porNomeCurso.set(nome, l);
    }
    const titulosDaLinha = new Map<LegadoPessoaCurso, LegadoTituloResumo[]>();
    const titulosSemMatricula: LegadoTituloResumo[] = [];
    const importadas = new Set<LegadoPessoaCurso>();
    for (const titulo of titulos) {
      const linha =
        porAlunocurso.get(titulo.alunocursoId) ??
        porNomeCurso.get(normalizarNome(titulo.cursoNome));
      if (!linha) {
        titulosSemMatricula.push(titulo);
        continue;
      }
      titulosDaLinha.set(linha, [...(titulosDaLinha.get(linha) ?? []), titulo]);
    }

    for (const linha of cursosDaPessoa) {
      let curso: Curso;
      try {
        curso = await this.resolverCurso(linha, ctx);
      } catch (erro) {
        ctx.ocorrencias.push({
          tipo: TipoOcorrenciaLote.MATRICULA_NAO_REALIZADA,
          ...referencia,
          curso: linha.cursoNome || linha.cursoId,
          motivo: `Não foi possível cadastrar o curso: ${mensagemDe(erro)}`,
        });
        continue;
      }

      let matricula = await matriculasRepository.findByAlunoECurso(aluno.id, curso.id);
      if (!matricula) {
        matricula = await matriculasRepository.create({
          aluno: { connect: { id: aluno.id } },
          curso: { connect: { id: curso.id } },
        });
        ctx.totais.matriculasNovas += 1;
      }
      await garantirSituacaoPendente(matricula, ctx.situacaoPendente, ctx.usuarioId);
      importadas.add(linha);

      const gravadas = await gravarTitulosNaMatricula(
        matricula,
        titulosDaLinha.get(linha) ?? [],
        ctx.usuarioId,
        [],
        {
          auditar: false,
          aoIgnorar: (titulo, motivo) =>
            ctx.ocorrencias.push({
              tipo: TipoOcorrenciaLote.PARCELA_NAO_IMPORTADA,
              ...referencia,
              curso: curso.nome,
              titulo: `${titulo.tituloId} — ${titulo.tituloDescricao} (${titulo.tituloParcela})`,
              motivo,
            }),
        },
      );
      ctx.totais.parcelasNovas += gravadas.novas;
      ctx.totais.parcelasAtualizadas += gravadas.atualizadas;
    }

    // Títulos de uma matrícula que não entrou (curso com erro) ou que o legado não relacionou a
    // nenhum curso da pessoa.
    const semMatriculaImportada = [
      ...titulosSemMatricula,
      ...[...titulosDaLinha.entries()]
        .filter(([linha]) => !importadas.has(linha))
        .flatMap(([, t]) => t),
    ];
    for (const titulo of semMatriculaImportada) {
      ctx.ocorrencias.push({
        tipo: TipoOcorrenciaLote.PARCELA_NAO_IMPORTADA,
        ...referencia,
        curso: titulo.cursoNome || null,
        titulo: `${titulo.tituloId} — ${titulo.tituloDescricao} (${titulo.tituloParcela})`,
        motivo: "Título de uma matrícula que não foi importada",
      });
    }
  },
};
