import { prisma } from "../../database/prisma";

/** "AAAA-MM-DD" de uma data local. */
function dataIso(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** "AAAA-MM" de uma data local. */
function chaveMes(d: Date): string {
  return dataIso(d).slice(0, 7);
}

/** Meses consecutivos a partir de `inicio` (inclusive), como "AAAA-MM". */
export function mesesDesde(inicio: Date, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) =>
    chaveMes(new Date(inicio.getFullYear(), inicio.getMonth() + i, 1)),
  );
}

/** Completa a série com zero nos meses sem registro, na ordem cronológica. */
export function completarSerie<T extends { mes: string }>(
  meses: string[],
  linhas: T[],
  vazio: Omit<T, "mes">,
): T[] {
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  return meses.map((mes) => porMes.get(mes) ?? ({ mes, ...vazio } as T));
}

const arredonda = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface ResumoParcelas {
  abertas_qtd: number;
  abertas_valor: number;
  vencidas_qtd: number;
  vencidas_valor: number;
  alunos_inadimplentes: number;
  matriculas_inadimplentes: number;
  dias_medio_atraso: number;
  maior_atraso: number;
  a_vencer_qtd: number;
  a_vencer_valor: number;
  a_vencer_30_qtd: number;
  a_vencer_30_valor: number;
  pagas_qtd: number;
  pagas_valor: number;
  prazo_medio_pagamento: number;
  recebido_mes: number;
  recebido_mes_anterior: number;
  protestadas_qtd: number;
  protestadas_valor: number;
  renegociadas_qtd: number;
  renegociadas_valor: number;
  ticket_medio: number;
}

export const dashboardVisaoRepository = {
  /**
   * Visão geral da operação: alunos, matrículas, cursos e a carteira de parcelas (em aberto,
   * vencidas, a vencer, pagas), com séries mensais, faixas de atraso e quebra por curso/tipo.
   * Tudo agregado no banco (a base passa de dezenas de milhares de parcelas).
   *
   * "Vencida" = em aberto com vencimento antes de hoje. Matrículas importadas do legado não
   * têm data de matrícula: usa-se o primeiro vencimento como aproximação do mês de entrada.
   */
  async visaoGeral(hoje = new Date()) {
    const hojeIso = dataIso(hoje);
    const em30 = dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 30));
    const inicioMesAtual = dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    const inicioMesAnterior = dataIso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
    const inicioSerie = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    const inicioSerieIso = dataIso(inicioSerie);
    const fimAVencerIso = dataIso(new Date(hoje.getFullYear(), hoje.getMonth() + 6, 1));

    // Lotes de 3 consultas: o pool do Prisma tem 5 conexões e as outras telas do dashboard também
    // consultam o banco — 11 em paralelo estouravam o pool (P2024: timeout de conexão).
    const [[totais], [parcelas], matriculasMes] = await Promise.all([
      prisma.$queryRaw<
        {
          alunos: number;
          alunos_com_matricula: number;
          matriculas: number;
          cursos: number;
          cursos_com_matricula: number;
        }[]
      >`SELECT
          (SELECT COUNT(*)::int FROM alunos) AS alunos,
          (SELECT COUNT(DISTINCT aluno_id)::int FROM matriculas) AS alunos_com_matricula,
          (SELECT COUNT(*)::int FROM matriculas) AS matriculas,
          (SELECT COUNT(*)::int FROM cursos) AS cursos,
          (SELECT COUNT(DISTINCT curso_id)::int FROM matriculas) AS cursos_com_matricula`,

      prisma.$queryRaw<ResumoParcelas[]>`SELECT
          COUNT(*) FILTER (WHERE p.status = 'EM_ABERTO')::int AS abertas_qtd,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO'), 0)::float8 AS abertas_valor,
          COUNT(*) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date)::int AS vencidas_qtd,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date), 0)::float8 AS vencidas_valor,
          COUNT(DISTINCT m.aluno_id) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date)::int AS alunos_inadimplentes,
          COUNT(DISTINCT p.matricula_id) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date)::int AS matriculas_inadimplentes,
          COALESCE(AVG(${hojeIso}::date - p.vencimento::date) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date), 0)::float8 AS dias_medio_atraso,
          COALESCE(MAX(${hojeIso}::date - p.vencimento::date) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date), 0)::int AS maior_atraso,
          COUNT(*) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento >= ${hojeIso}::date)::int AS a_vencer_qtd,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento >= ${hojeIso}::date), 0)::float8 AS a_vencer_valor,
          COUNT(*) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento >= ${hojeIso}::date AND p.vencimento < ${em30}::date)::int AS a_vencer_30_qtd,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento >= ${hojeIso}::date AND p.vencimento < ${em30}::date), 0)::float8 AS a_vencer_30_valor,
          COUNT(*) FILTER (WHERE p.status = 'PAGO')::int AS pagas_qtd,
          COALESCE(SUM(COALESCE(p.valor_pago, p.valor)) FILTER (WHERE p.status = 'PAGO'), 0)::float8 AS pagas_valor,
          COALESCE(AVG(p.data_pagamento::date - p.vencimento::date) FILTER (WHERE p.status = 'PAGO' AND p.data_pagamento IS NOT NULL), 0)::float8 AS prazo_medio_pagamento,
          COALESCE(SUM(COALESCE(p.valor_pago, p.valor)) FILTER (WHERE p.status = 'PAGO' AND p.data_pagamento >= ${inicioMesAtual}::date), 0)::float8 AS recebido_mes,
          COALESCE(SUM(COALESCE(p.valor_pago, p.valor)) FILTER (WHERE p.status = 'PAGO' AND p.data_pagamento >= ${inicioMesAnterior}::date AND p.data_pagamento < ${inicioMesAtual}::date), 0)::float8 AS recebido_mes_anterior,
          COUNT(*) FILTER (WHERE p.status IN ('PROTESTADO', 'PROTESTO_ENVIADO'))::int AS protestadas_qtd,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status IN ('PROTESTADO', 'PROTESTO_ENVIADO')), 0)::float8 AS protestadas_valor,
          COUNT(*) FILTER (WHERE p.status = 'RENEGOCIADO')::int AS renegociadas_qtd,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'RENEGOCIADO'), 0)::float8 AS renegociadas_valor,
          COALESCE(AVG(p.valor), 0)::float8 AS ticket_medio
        FROM parcelas p
        JOIN matriculas m ON m.id = p.matricula_id`,

      // Matrículas por mês de entrada (data da matrícula ou 1º vencimento).
      prisma.$queryRaw<{ mes: string; matriculas: number }[]>`WITH entrada AS (
          SELECT m.id,
                 COALESCE(m.data_matricula, (SELECT MIN(p.vencimento) FROM parcelas p WHERE p.matricula_id = m.id)) AS dt
          FROM matriculas m
        )
        SELECT to_char(date_trunc('month', dt), 'YYYY-MM') AS mes, COUNT(*)::int AS matriculas
        FROM entrada WHERE dt >= ${inicioSerieIso}::date AND dt < ${fimAVencerIso}::date GROUP BY 1`,
    ]);

    const [alunosNovosMes, recebidoMes, aVencerMes] = await Promise.all([
      // Alunos novos por mês: mês da primeira matrícula de cada aluno.
      prisma.$queryRaw<{ mes: string; alunos: number }[]>`WITH entrada AS (
          SELECT m.aluno_id,
                 MIN(COALESCE(m.data_matricula, (SELECT MIN(p.vencimento) FROM parcelas p WHERE p.matricula_id = m.id))) AS dt
          FROM matriculas m GROUP BY m.aluno_id
        )
        SELECT to_char(date_trunc('month', dt), 'YYYY-MM') AS mes, COUNT(*)::int AS alunos
        FROM entrada WHERE dt >= ${inicioSerieIso}::date AND dt < ${fimAVencerIso}::date GROUP BY 1`,

      prisma.$queryRaw<{ mes: string; qtd: number; valor: number }[]>`SELECT
          to_char(date_trunc('month', data_pagamento), 'YYYY-MM') AS mes,
          COUNT(*)::int AS qtd,
          COALESCE(SUM(COALESCE(valor_pago, valor)), 0)::float8 AS valor
        FROM parcelas
        WHERE status = 'PAGO' AND data_pagamento >= ${inicioSerieIso}::date
        GROUP BY 1`,

      prisma.$queryRaw<{ mes: string; qtd: number; valor: number }[]>`SELECT
          to_char(date_trunc('month', vencimento), 'YYYY-MM') AS mes,
          COUNT(*)::int AS qtd,
          COALESCE(SUM(valor), 0)::float8 AS valor
        FROM parcelas
        WHERE status = 'EM_ABERTO' AND vencimento >= ${hojeIso}::date AND vencimento < ${fimAVencerIso}::date
        GROUP BY 1`,
    ]);

    const [faixas, porCurso, porTipo] = await Promise.all([
      // Faixas de atraso das parcelas vencidas.
      prisma.$queryRaw<
        { faixa: string; ordem: number; qtd: number; valor: number }[]
      >`SELECT faixa, ordem,
          COUNT(*)::int AS qtd, COALESCE(SUM(valor), 0)::float8 AS valor
        FROM (
          SELECT p.valor,
            CASE
              WHEN dias <= 30 THEN '1 a 30 dias'
              WHEN dias <= 60 THEN '31 a 60 dias'
              WHEN dias <= 90 THEN '61 a 90 dias'
              WHEN dias <= 180 THEN '91 a 180 dias'
              WHEN dias <= 365 THEN '181 a 365 dias'
              ELSE 'Mais de 1 ano'
            END AS faixa,
            CASE
              WHEN dias <= 30 THEN 1 WHEN dias <= 60 THEN 2 WHEN dias <= 90 THEN 3
              WHEN dias <= 180 THEN 4 WHEN dias <= 365 THEN 5 ELSE 6
            END AS ordem
          FROM (
            SELECT valor, (${hojeIso}::date - vencimento::date) AS dias
            FROM parcelas WHERE status = 'EM_ABERTO' AND vencimento < ${hojeIso}::date
          ) p
        ) f
        GROUP BY faixa, ordem ORDER BY ordem`,

      prisma.$queryRaw<
        {
          curso_id: string;
          nome: string;
          matriculas: number;
          alunos: number;
          parcelas_abertas: number;
          aberto: number;
          a_vencer: number;
          vencido: number;
          dias_medio_atraso: number;
        }[]
      >`SELECT c.id AS curso_id, c.nome,
          COUNT(DISTINCT m.id)::int AS matriculas,
          COUNT(DISTINCT m.aluno_id)::int AS alunos,
          COUNT(p.id) FILTER (WHERE p.status = 'EM_ABERTO')::int AS parcelas_abertas,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO'), 0)::float8 AS aberto,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento >= ${hojeIso}::date), 0)::float8 AS a_vencer,
          COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date), 0)::float8 AS vencido,
          COALESCE(AVG(${hojeIso}::date - p.vencimento::date) FILTER (WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date), 0)::float8 AS dias_medio_atraso
        FROM cursos c
        JOIN matriculas m ON m.curso_id = c.id
        LEFT JOIN parcelas p ON p.matricula_id = m.id
        GROUP BY c.id, c.nome
        ORDER BY matriculas DESC, c.nome`,

      prisma.$queryRaw<{ tipo: string; qtd: number; aberto: number; vencido: number }[]>`SELECT
          COALESCE(NULLIF(TRIM(tipo_titulo), ''), 'Sem tipo') AS tipo,
          COUNT(*)::int AS qtd,
          COALESCE(SUM(valor), 0)::float8 AS aberto,
          COALESCE(SUM(valor) FILTER (WHERE vencimento < ${hojeIso}::date), 0)::float8 AS vencido
        FROM parcelas WHERE status = 'EM_ABERTO'
        GROUP BY 1 ORDER BY aberto DESC`,
    ]);

    const [topDevedores, situacoes] = await Promise.all([
      prisma.$queryRaw<
        {
          aluno_id: string;
          nome: string;
          matriculas: number;
          parcelas: number;
          valor: number;
          maior_atraso: number;
        }[]
      >`SELECT a.id AS aluno_id, a.nome,
          COUNT(DISTINCT m.id)::int AS matriculas,
          COUNT(p.id)::int AS parcelas,
          SUM(p.valor)::float8 AS valor,
          MAX(${hojeIso}::date - p.vencimento::date)::int AS maior_atraso
        FROM parcelas p
        JOIN matriculas m ON m.id = p.matricula_id
        JOIN alunos a ON a.id = m.aluno_id
        WHERE p.status = 'EM_ABERTO' AND p.vencimento < ${hojeIso}::date
        GROUP BY a.id, a.nome
        ORDER BY valor DESC
        LIMIT 10`,

      prisma.$queryRaw<{ situacao: string; qtd: number }[]>`SELECT situacao, COUNT(*)::int AS qtd
        FROM matriculas GROUP BY situacao ORDER BY qtd DESC`,
    ]);

    const meses12 = mesesDesde(inicioSerie, 12);
    const proximos6 = mesesDesde(new Date(hoje.getFullYear(), hoje.getMonth(), 1), 6);
    const vencidoValor = parcelas.vencidas_valor;
    const baseInadimplencia = vencidoValor + parcelas.pagas_valor;

    return {
      geradoEm: hoje.toISOString(),
      indicadores: {
        totalAlunos: totais.alunos,
        alunosComMatricula: totais.alunos_com_matricula,
        totalMatriculas: totais.matriculas,
        totalCursos: totais.cursos,
        cursosComMatricula: totais.cursos_com_matricula,
        parcelasEmAberto: parcelas.abertas_qtd,
        valorEmAberto: arredonda(parcelas.abertas_valor),
        parcelasVencidas: parcelas.vencidas_qtd,
        valorVencido: arredonda(vencidoValor),
        parcelasAVencer: parcelas.a_vencer_qtd,
        valorAVencer: arredonda(parcelas.a_vencer_valor),
        parcelasAVencer30Dias: parcelas.a_vencer_30_qtd,
        valorAVencer30Dias: arredonda(parcelas.a_vencer_30_valor),
        parcelasPagas: parcelas.pagas_qtd,
        valorRecebido: arredonda(parcelas.pagas_valor),
        recebidoMes: arredonda(parcelas.recebido_mes),
        recebidoMesAnterior: arredonda(parcelas.recebido_mes_anterior),
        alunosInadimplentes: parcelas.alunos_inadimplentes,
        matriculasInadimplentes: parcelas.matriculas_inadimplentes,
        diasMedioAtraso: arredonda(parcelas.dias_medio_atraso),
        maiorAtrasoDias: parcelas.maior_atraso,
        prazoMedioPagamentoDias: arredonda(parcelas.prazo_medio_pagamento),
        percentualInadimplencia:
          baseInadimplencia > 0 ? arredonda((vencidoValor / baseInadimplencia) * 100) : 0,
        ticketMedio: arredonda(parcelas.ticket_medio),
        parcelasProtestadas: parcelas.protestadas_qtd,
        valorProtestado: arredonda(parcelas.protestadas_valor),
        parcelasRenegociadas: parcelas.renegociadas_qtd,
        valorRenegociado: arredonda(parcelas.renegociadas_valor),
      },
      matriculasPorMes: completarSerie(meses12, matriculasMes, { matriculas: 0 }),
      alunosNovosPorMes: completarSerie(meses12, alunosNovosMes, { alunos: 0 }),
      recebidoPorMes: completarSerie(
        meses12,
        recebidoMes.map((r) => ({ ...r, valor: arredonda(r.valor) })),
        { qtd: 0, valor: 0 },
      ),
      aVencerPorMes: completarSerie(
        proximos6,
        aVencerMes.map((r) => ({ ...r, valor: arredonda(r.valor) })),
        { qtd: 0, valor: 0 },
      ),
      faixasAtraso: faixas.map((f) => ({ faixa: f.faixa, qtd: f.qtd, valor: arredonda(f.valor) })),
      porCurso: porCurso.map((c) => ({
        cursoId: c.curso_id,
        cursoNome: c.nome,
        matriculas: c.matriculas,
        alunos: c.alunos,
        parcelasAbertas: c.parcelas_abertas,
        valorAberto: arredonda(c.aberto),
        valorAVencer: arredonda(c.a_vencer),
        valorVencido: arredonda(c.vencido),
        diasMedioAtraso: arredonda(c.dias_medio_atraso),
      })),
      porTipoTitulo: porTipo.map((t) => ({
        tipo: t.tipo,
        parcelas: t.qtd,
        valorAberto: arredonda(t.aberto),
        valorVencido: arredonda(t.vencido),
      })),
      maioresDevedores: topDevedores.map((d) => ({
        alunoId: d.aluno_id,
        nome: d.nome,
        matriculas: d.matriculas,
        parcelas: d.parcelas,
        valorVencido: arredonda(d.valor),
        maiorAtrasoDias: d.maior_atraso,
      })),
      matriculasPorSituacao: situacoes.map((s) => ({ situacao: s.situacao, matriculas: s.qtd })),
    };
  },
};
