import type { AsaasBillingType, EmissaoCobranca } from "@prisma/client";
import { AppError } from "../../shared/errors/app-error";
import { configuracoesRepository } from "../configuracoes/configuracoes.repository";
import { asaasService } from "./asaas.service";
import { emissaoCobrancaRepository } from "./emissao-cobranca.repository";

// Máximo de cobranças emitidas por execução do job diário — o excedente fica
// para o dia seguinte (ainda dentro da antecedência) em vez de sobrecarregar o Asaas.
const LIMITE_POR_EXECUCAO = 300;

export interface ResultadoEmissao {
  emitidas: number;
  falhas: { parcelaId: string; erro: string }[];
}

/** A parcela de índice `indice` (0 = primeira) já nasce com cobrança emitida? */
export function emiteNaMatricula(politica: EmissaoCobranca, indice: number): boolean {
  if (politica === "TODAS") return true;
  if (politica === "PRIMEIRA") return indice === 0;
  return false;
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : "Erro desconhecido";
}

export const emissaoCobrancaService = {
  /**
   * Emite a cobrança (boleto/Pix/cartão) das parcelas informadas. Melhor
   * esforço: uma falha (ex.: Asaas não configurado) não derruba as demais nem
   * a operação que chamou — vai para `falhas` e a parcela continua disponível
   * para emissão manual na Ficha ou pelo aluno.
   * `usuarioId` nulo = processo automático (sem usuário na Auditoria).
   */
  async emitir(
    parcelas: { id: string; formaPagamento: AsaasBillingType | null }[],
    formaPadrao: AsaasBillingType | null,
    usuarioId: string | null,
  ): Promise<ResultadoEmissao> {
    const resultado: ResultadoEmissao = { emitidas: 0, falhas: [] };
    for (const parcela of parcelas) {
      try {
        await asaasService.gerarCobrancaParcela(
          parcela.id,
          parcela.formaPagamento ?? formaPadrao ?? "BOLETO",
          usuarioId,
        );
        resultado.emitidas += 1;
      } catch (erro) {
        // Cartão pela Rede é pago pelo próprio aluno: não há cobrança a emitir.
        if (erro instanceof AppError && erro.codigo === "CARTAO_REDE_SEM_LINK") continue;
        resultado.falhas.push({ parcelaId: parcela.id, erro: mensagem(erro) });
      }
    }
    return resultado;
  },

  /**
   * Job diário: emite as cobranças das parcelas que vencem em até
   * `emissaoAntecipadaDias` e ainda não têm cobrança — evita pagar tarifa de
   * boleto de parcela que talvez nunca seja usada (decisão do usuário,
   * 2026-10-07). Tipos "sob demanda" e parcelas sem tipo (importadas) ficam de fora.
   */
  async executarEmissaoAntecipada(agora = new Date()): Promise<ResultadoEmissao & { dias: number }> {
    const { emissaoAntecipadaDias: dias } = await configuracoesRepository.obterOuCriar();
    if (dias <= 0) return { dias, emitidas: 0, falhas: [] };

    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const limite = new Date(inicioHoje.getTime());
    limite.setDate(limite.getDate() + dias);
    limite.setHours(23, 59, 59, 999);

    const [tipos, candidatas] = await Promise.all([
      emissaoCobrancaRepository.listarTipos(),
      emissaoCobrancaRepository.listarSemCobrancaVencendo(inicioHoje, limite, LIMITE_POR_EXECUCAO),
    ]);
    const politicaPorNome = new Map(tipos.map((t) => [t.nome.toLowerCase(), t]));

    const elegiveis = candidatas.filter((p) => {
      const tipo = politicaPorNome.get((p.tipoTitulo ?? "").toLowerCase());
      return tipo !== undefined && tipo.emissaoNaMatricula !== "SOB_DEMANDA";
    });

    // Agrupa por forma padrão do tipo (a forma da própria parcela vence).
    const resultado: ResultadoEmissao = { emitidas: 0, falhas: [] };
    for (const parcela of elegiveis) {
      const tipo = politicaPorNome.get((parcela.tipoTitulo ?? "").toLowerCase());
      const r = await this.emitir([parcela], tipo?.formaPagamentoPadrao ?? null, null);
      resultado.emitidas += r.emitidas;
      resultado.falhas.push(...r.falhas);
    }
    return { dias, ...resultado };
  },
};
