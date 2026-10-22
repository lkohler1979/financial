import { formatDate } from "@angular/common";
import { Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { Parcela } from "../../core/models/parcela.model";

export interface DadosParcelaDetalhes {
  parcela: Parcela;
  /** "Estado da parcela" já calculado pela ficha (Paga, A vencer, Vencida há…). */
  estado: string;
}

interface Campo {
  rotulo: string;
  valor: string;
  /** Texto longo sem espaços (hash, linha digitável…): quebra em qualquer ponto. */
  longo?: boolean;
}

interface Secao {
  titulo: string;
  campos: Campo[];
}

const VAZIO = "—";
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const texto = (v: unknown): string => (v == null || v === "" ? VAZIO : String(v));
const dinheiro = (v: number | null | undefined): string => (v == null ? VAZIO : moeda.format(v));
const data = (v: string | null | undefined): string =>
  v ? formatDate(v, "dd/MM/yyyy", "en-US", "UTC") : VAZIO;
const simNao = (v: boolean): string => (v ? "Sim" : "Não");

const ROTULO_STATUS: Record<string, string> = {
  EM_ABERTO: "Em aberto",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
  PROTESTO_ENVIADO: "Enviado para protesto",
  PROTESTADO: "Protestado",
  RENEGOCIADO: "Renegociado",
};
const ROTULO_FORMA: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
};

/** Todos os campos de uma parcela, agrupados — para conferência. Campo vazio aparece como "—". */
@Component({
  selector: "app-parcela-detalhes-dialog",
  standalone: true,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>
      Parcela {{ dados.parcela.parcela }} · título {{ dados.parcela.codTitulo }}
    </h2>
    <mat-dialog-content class="!max-h-[70vh]">
      @for (secao of secoes(); track secao.titulo) {
        <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-1">
          {{ secao.titulo }}
        </p>
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 m-0">
          @for (campo of secao.campos; track campo.rotulo) {
            <div class="flex gap-2 text-sm py-0.5 border-b border-gray-100 min-w-0">
              <dt class="text-gray-500 w-44 flex-shrink-0">{{ campo.rotulo }}</dt>
              <dd class="m-0 min-w-0" [class.break-all]="campo.longo" [class.text-xs]="campo.longo">
                {{ campo.valor }}
              </dd>
            </div>
          }
        </dl>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
})
export class ParcelaDetalhesDialogComponent {
  readonly dados = inject<DadosParcelaDetalhes>(MAT_DIALOG_DATA);

  secoes(): Secao[] {
    const p = this.dados.parcela;
    return [
      {
        titulo: "Identificação",
        campos: [
          { rotulo: "Parcela", valor: texto(p.parcela) },
          { rotulo: "Título", valor: texto(p.codTitulo) },
          { rotulo: "Tipo de título", valor: texto(p.tipoTitulo) },
          { rotulo: "Código do tipo (legado)", valor: texto(p.tipoTituloIdLegado) },
          { rotulo: "Vencimento", valor: data(p.vencimento) },
          { rotulo: "Valor", valor: dinheiro(p.valor) },
        ],
      },
      {
        titulo: "Estado e situação",
        campos: [
          { rotulo: "Estado da parcela", valor: this.dados.estado },
          { rotulo: "Status", valor: texto(ROTULO_STATUS[p.status] ?? p.status) },
          { rotulo: "Situação de cobrança", valor: texto(p.situacaoCobranca?.nome) },
          { rotulo: "Estado no legado", valor: texto(p.estadoLegado) },
          {
            rotulo: "Conferida com o legado",
            valor: simNao(p.statusSincronizacaoLegado === "SINCRONIZADO"),
          },
        ],
      },
      {
        titulo: "Pagamento",
        campos: [
          { rotulo: "Valor pago", valor: dinheiro(p.valorPago) },
          { rotulo: "Data de pagamento", valor: data(p.dataPagamento) },
          { rotulo: "Data Pagto (legado)", valor: data(p.dataPagamentoLegado) },
          { rotulo: "Data Baixa (legado)", valor: data(p.dataBaixaLegado) },
        ],
      },
      {
        titulo: "Multa e juros",
        campos: [
          { rotulo: "Multa (legado)", valor: dinheiro(p.multaLegado) },
          { rotulo: "Juros (legado)", valor: dinheiro(p.jurosLegado) },
          { rotulo: "Total (legado)", valor: dinheiro(p.totalLegado) },
          { rotulo: "Desconto (legado)", valor: dinheiro(p.descontoLegado) },
          { rotulo: "Multa (protesto)", valor: dinheiro(p.multaProtesto) },
          { rotulo: "Juros (protesto)", valor: dinheiro(p.jurosProtesto) },
          { rotulo: "Total (protesto)", valor: dinheiro(p.totalProtesto) },
          { rotulo: "Valor c/ juros (origem)", valor: dinheiro(p.valorOrigemComJurosEMulta) },
        ],
      },
      {
        titulo: "Legado",
        campos: [
          { rotulo: "Boleto", valor: texto(p.boletoLegadoId) },
          { rotulo: "Hash do boleto", valor: texto(p.boletoLegadoHash), longo: true },
          { rotulo: "Remessa", valor: texto(p.remessaLegadoId) },
          { rotulo: "Observações do legado", valor: texto(p.tituloObservacoesLegado) },
        ],
      },
      {
        titulo: "Cobrança (boleto, Pix, cartão)",
        campos: [
          {
            rotulo: "Forma de pagamento",
            valor: texto(p.formaPagamento ? ROTULO_FORMA[p.formaPagamento] : null),
          },
          { rotulo: "Provedor", valor: texto(p.provedorPagamento) },
          {
            rotulo: "Tipo de cobrança gerada",
            valor: texto(p.asaasBillingType ? ROTULO_FORMA[p.asaasBillingType] : null),
          },
          { rotulo: "Código da cobrança", valor: texto(p.asaasPaymentId), longo: true },
          { rotulo: "Status no provedor", valor: texto(p.asaasStatus) },
          { rotulo: "Link do boleto", valor: texto(p.asaasBoletoUrl), longo: true },
          { rotulo: "Linha digitável", valor: texto(p.asaasLinhaDigitavel), longo: true },
          { rotulo: "Fatura", valor: texto(p.asaasInvoiceUrl), longo: true },
          { rotulo: "Pix copia e cola", valor: texto(p.asaasPixCopiaECola), longo: true },
          { rotulo: "Cartão — bandeira", valor: texto(p.cartaoBandeira) },
          { rotulo: "Cartão — final", valor: texto(p.cartaoFinal) },
          { rotulo: "Cartão — parcelas", valor: texto(p.cartaoParcelas) },
          { rotulo: "Estorno em andamento", valor: texto(p.cartaoEstornoId), longo: true },
        ],
      },
      {
        titulo: "Nota fiscal (NFS-e)",
        campos: [
          { rotulo: "Situação da nota", valor: texto(p.nfseStatus) },
          { rotulo: "Número", valor: texto(p.nfseNumero) },
          { rotulo: "Chave de acesso", valor: texto(p.nfseChaveAcesso), longo: true },
          { rotulo: "Erro", valor: texto(p.nfseErro) },
        ],
      },
      {
        titulo: "Observações internas",
        campos: [{ rotulo: "Observações", valor: texto(p.observacoes) }],
      },
    ];
  }
}
