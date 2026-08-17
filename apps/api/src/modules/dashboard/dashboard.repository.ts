import { Prisma, StatusParcela } from "@prisma/client";
import { prisma } from "../../database/prisma";

function inicioHoje(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

function chaveMes(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function ultimosMeses(quantidade: number): string[] {
  const hoje = new Date();
  const meses: string[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    meses.push(chaveMes(new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)));
  }
  return meses;
}

function numero(valor: Prisma.Decimal | number | null | undefined): number {
  return valor === null || valor === undefined ? 0 : Number(valor);
}

function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

async function buscarParcelasVencidas() {
  return prisma.parcela.findMany({
    where: { status: "EM_ABERTO", vencimento: { lt: inicioHoje() } },
    include: {
      matricula: {
        select: {
          id: true,
          alunoId: true,
          contratoAssinado: true,
          curso: { select: { id: true, nome: true } },
          situacaoCobranca: { select: { id: true, nome: true, cor: true } },
          tags: { select: { tag: { select: { id: true, nome: true } } } },
        },
      },
    },
  });
}

function agruparRelatoriosPorMes(
  relatorios: Array<{ data: Date; totalDocumentosGerados: number }>,
  meses: string[],
) {
  const mapa = new Map(
    meses.map((mes) => [mes, { mes, relatoriosGerados: 0, documentosGerados: 0 }]),
  );

  for (const relatorio of relatorios) {
    const mes = chaveMes(relatorio.data);
    const atual = mapa.get(mes);
    if (!atual) continue;
    atual.relatoriosGerados += 1;
    atual.documentosGerados += relatorio.totalDocumentosGerados;
  }

  return Array.from(mapa.values());
}

export const dashboardRepository = {
  async geral() {
    const meses = ultimosMeses(12);
    const inicioSerie = new Date(`${meses[0]}-01T00:00:00.000Z`);

    const [
      totalAlunos,
      totalCursos,
      totalCursosAtivos,
      totalMatriculas,
      relatoriosGerados,
      ultimaImportacao,
      relatoriosPeriodo,
      parcelasVencidas,
    ] = await Promise.all([
      prisma.aluno.count(),
      prisma.curso.count(),
      prisma.curso.count({ where: { situacao: true } }),
      prisma.matricula.count(),
      prisma.relatorioInadimplencia.count(),
      prisma.importacao.findFirst({ orderBy: { data: "desc" } }),
      prisma.relatorioInadimplencia.findMany({
        where: { data: { gte: inicioSerie } },
        select: { data: true, totalDocumentosGerados: true },
      }),
      buscarParcelasVencidas(),
    ]);

    const alunosInadimplentes = new Set<string>();
    const cursoMap = new Map<
      string,
      {
        cursoId: string;
        cursoNome: string;
        matriculaIds: Set<string>;
        parcelas: number;
        valorTotal: number;
      }
    >();
    const mesesParcelas = new Map(
      meses.map((mes) => [mes, { mes, matriculaIds: new Set<string>(), parcelas: 0 }]),
    );
    const mesesValores = new Map(meses.map((mes) => [mes, { mes, valor: 0 }]));

    for (const parcela of parcelasVencidas) {
      const valor = numero(parcela.valor);
      const { matricula } = parcela;
      alunosInadimplentes.add(matricula.alunoId);

      const cursoAtual = cursoMap.get(matricula.curso.id) ?? {
        cursoId: matricula.curso.id,
        cursoNome: matricula.curso.nome,
        matriculaIds: new Set<string>(),
        parcelas: 0,
        valorTotal: 0,
      };
      cursoAtual.matriculaIds.add(matricula.id);
      cursoAtual.parcelas += 1;
      cursoAtual.valorTotal += valor;
      cursoMap.set(matricula.curso.id, cursoAtual);

      const mes = chaveMes(parcela.vencimento);
      const inadimplenciaMensal = mesesParcelas.get(mes);
      if (inadimplenciaMensal) {
        inadimplenciaMensal.matriculaIds.add(matricula.id);
        inadimplenciaMensal.parcelas += 1;
      }
      const valorMensal = mesesValores.get(mes);
      if (valorMensal) valorMensal.valor += valor;
    }

    return {
      indicadores: {
        totalAlunos,
        totalCursos,
        totalCursosAtivos,
        totalMatriculas,
        parcelasVencidas: parcelasVencidas.length,
        valorTotalVencido: arredondar(
          parcelasVencidas.reduce((soma, p) => soma + numero(p.valor), 0),
        ),
        alunosInadimplentes: alunosInadimplentes.size,
        relatoriosGerados,
        ultimaImportacao,
      },
      inadimplenciaPorCurso: Array.from(cursoMap.values())
        .map((item) => ({
          cursoId: item.cursoId,
          cursoNome: item.cursoNome,
          matriculas: item.matriculaIds.size,
          parcelas: item.parcelas,
          valorTotal: arredondar(item.valorTotal),
        }))
        .sort((a, b) => b.valorTotal - a.valorTotal)
        .slice(0, 10),
      inadimplenciaMensal: Array.from(mesesParcelas.values()).map((item) => ({
        mes: item.mes,
        matriculas: item.matriculaIds.size,
        parcelas: item.parcelas,
      })),
      valorVencidoPorMes: Array.from(mesesValores.values()).map((item) => ({
        mes: item.mes,
        valor: arredondar(item.valor),
      })),
      evolucaoHistorica: agruparRelatoriosPorMes(relatoriosPeriodo, meses),
    };
  },

  async cobranca() {
    const meses = ultimosMeses(6);
    const inicioSerie = new Date(`${meses[0]}-01T00:00:00.000Z`);

    const [parcelasVencidas, valoresPorStatus, relatoriosPeriodo] = await Promise.all([
      buscarParcelasVencidas(),
      prisma.parcela.groupBy({
        by: ["status"],
        _sum: { valor: true, valorPago: true },
        _count: { _all: true },
      }),
      prisma.relatorioInadimplencia.findMany({
        where: { data: { gte: inicioSerie } },
        select: { data: true, totalDocumentosGerados: true },
      }),
    ]);

    const statusMap = new Map(valoresPorStatus.map((item) => [item.status, item]));
    const valorStatus = (status: StatusParcela, campo: "valor" | "valorPago" = "valor") =>
      arredondar(numero(statusMap.get(status)?._sum[campo]));

    const matriculasInadimplentes = new Set<string>();
    const comContrato = { matriculaIds: new Set<string>(), valor: 0 };
    const semContrato = { matriculaIds: new Set<string>(), valor: 0 };
    const situacaoMap = new Map<
      string,
      { id: string | null; nome: string; cor: string; matriculaIds: Set<string>; valor: number }
    >();
    const tagMap = new Map<
      string,
      { id: string; nome: string; matriculaIds: Set<string>; valor: number }
    >();
    const cursoMap = new Map<
      string,
      { cursoId: string; cursoNome: string; matriculaIds: Set<string>; valor: number }
    >();

    for (const parcela of parcelasVencidas) {
      const valor = numero(parcela.valor);
      const { matricula } = parcela;
      matriculasInadimplentes.add(matricula.id);

      const grupoContrato = matricula.contratoAssinado ? comContrato : semContrato;
      grupoContrato.matriculaIds.add(matricula.id);
      grupoContrato.valor += valor;

      const situacao = matricula.situacaoCobranca;
      const situacaoId = situacao?.id ?? "sem-situacao";
      const situacaoAtual = situacaoMap.get(situacaoId) ?? {
        id: situacao?.id ?? null,
        nome: situacao?.nome ?? "Sem situação",
        cor: situacao?.cor ?? "#6B7280",
        matriculaIds: new Set<string>(),
        valor: 0,
      };
      situacaoAtual.matriculaIds.add(matricula.id);
      situacaoAtual.valor += valor;
      situacaoMap.set(situacaoId, situacaoAtual);

      const cursoAtual = cursoMap.get(matricula.curso.id) ?? {
        cursoId: matricula.curso.id,
        cursoNome: matricula.curso.nome,
        matriculaIds: new Set<string>(),
        valor: 0,
      };
      cursoAtual.matriculaIds.add(matricula.id);
      cursoAtual.valor += valor;
      cursoMap.set(matricula.curso.id, cursoAtual);

      for (const associacao of matricula.tags) {
        const tagAtual = tagMap.get(associacao.tag.id) ?? {
          id: associacao.tag.id,
          nome: associacao.tag.nome,
          matriculaIds: new Set<string>(),
          valor: 0,
        };
        tagAtual.matriculaIds.add(matricula.id);
        tagAtual.valor += valor;
        tagMap.set(associacao.tag.id, tagAtual);
      }
    }

    return {
      indicadores: {
        inadimplentes: matriculasInadimplentes.size,
        valorEmAberto: valorStatus("EM_ABERTO"),
        parcelasEmAberto: statusMap.get("EM_ABERTO")?._count._all ?? 0,
        valorProtestado: valorStatus("PROTESTADO") + valorStatus("PROTESTO_ENVIADO"),
        valorRenegociado: valorStatus("RENEGOCIADO"),
        valorQuitado: valorStatus("PAGO", "valorPago") || valorStatus("PAGO"),
        relatoriosPeriodo: relatoriosPeriodo.length,
      },
      // Pedido do usuário: valor em aberto (vencido) separado por matrícula
      // ter ou não o contrato assinado, + o resumo somando os dois (igual ao
      // indicadores.valorEmAberto/inadimplentes acima, aqui lado a lado pra
      // comparação direta na mesma tela).
      porContrato: {
        comContrato: {
          matriculas: comContrato.matriculaIds.size,
          valor: arredondar(comContrato.valor),
        },
        semContrato: {
          matriculas: semContrato.matriculaIds.size,
          valor: arredondar(semContrato.valor),
        },
        resumo: {
          matriculas: comContrato.matriculaIds.size + semContrato.matriculaIds.size,
          valor: arredondar(comContrato.valor + semContrato.valor),
        },
      },
      porSituacao: Array.from(situacaoMap.values())
        .map((item) => ({
          id: item.id,
          nome: item.nome,
          cor: item.cor,
          quantidade: item.matriculaIds.size,
          valor: arredondar(item.valor),
        }))
        .sort((a, b) => b.quantidade - a.quantidade),
      porTag: Array.from(tagMap.values())
        .map((item) => ({
          id: item.id,
          nome: item.nome,
          quantidade: item.matriculaIds.size,
          valor: arredondar(item.valor),
        }))
        .sort((a, b) => b.quantidade - a.quantidade),
      topCursos: Array.from(cursoMap.values())
        .map((item) => ({
          cursoId: item.cursoId,
          cursoNome: item.cursoNome,
          matriculas: item.matriculaIds.size,
          valor: arredondar(item.valor),
        }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10),
      rankingTags: Array.from(tagMap.values())
        .map((item) => ({
          tagId: item.id,
          nome: item.nome,
          matriculas: item.matriculaIds.size,
          valor: arredondar(item.valor),
        }))
        .sort((a, b) => b.matriculas - a.matriculas)
        .slice(0, 10),
      relatoriosPorPeriodo: agruparRelatoriosPorMes(relatoriosPeriodo, meses),
    };
  },
};
