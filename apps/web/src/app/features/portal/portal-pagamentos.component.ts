import { CurrencyPipe, DatePipe } from "@angular/common";
import { Component, inject, input, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatMenuModule } from "@angular/material/menu";
import { MatSnackBar } from "@angular/material/snack-bar";
import { PortalMatricula, PortalParcela } from "../../core/models/portal.model";
import { FormaPagamento, ROTULO_FORMA_PAGAMENTO } from "../../core/models/tipo-cobranca.model";
import { PortalService } from "../../core/services/portal.service";
import { PortalCartaoDialogComponent } from "./portal-cartao-dialog.component";

const ROTULO_STATUS: Record<string, string> = {
  EM_ABERTO: "Em aberto",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
  PROTESTO_ENVIADO: "Em cobrança",
  PROTESTADO: "Em cobrança",
  RENEGOCIADO: "Renegociado",
};

/** Histórico de pagamentos do aluno e emissão de boleto/Pix/cartão. */
@Component({
  selector: "app-portal-pagamentos",
  standalone: true,
  imports: [CurrencyPipe, DatePipe, MatButtonModule, MatMenuModule],
  template: `
    <div class="bg-white rounded-lg border overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-400">
            <th class="p-2">Título</th>
            <th class="p-2">Descrição</th>
            <th class="p-2">Sacado</th>
            <th class="p-2">Aluno</th>
            <th class="p-2">Curso</th>
            <th class="p-2">Vencimento</th>
            <th class="p-2">Pagamento</th>
            <th class="p-2 text-right">Valor final</th>
            <th class="p-2">Estado</th>
            <th class="p-2"></th>
          </tr>
        </thead>
        <tbody>
          @for (p of parcelas(); track p.id) {
            <tr class="border-t align-top" [class]="classeLinha(p)">
              <td class="p-2 whitespace-nowrap">{{ p.codTitulo }}</td>
              <td class="p-2">{{ p.tipoTitulo ?? "Parcela" }} - {{ p.parcela.replace("/", " / ") }}</td>
              <td class="p-2">{{ p.matricula.sacado?.nome ?? p.matricula.aluno.nome }}</td>
              <td class="p-2">{{ p.matricula.aluno.nome }}</td>
              <td class="p-2">{{ p.matricula.curso.nome }}</td>
              <td class="p-2 whitespace-nowrap">{{ p.vencimento | date: "dd/MM/yyyy" : "UTC" }}</td>
              <td class="p-2 whitespace-nowrap">
                {{ p.dataPagamento ? (p.dataPagamento | date: "dd/MM/yyyy" : "UTC") : "—" }}
              </td>
              <td class="p-2 text-right whitespace-nowrap">{{ p.valor | currency: "BRL" }}</td>
              <td class="p-2">{{ rotulo(p) }}</td>
              <td class="p-2">
                @if (p.status === "EM_ABERTO") {
                  @if (p.asaasBillingType) {
                    @if (p.asaasBoletoUrl) {
                      <a mat-button class="!min-w-0 !px-2" [href]="p.asaasBoletoUrl" target="_blank" rel="noopener">Abrir boleto</a>
                    }
                    @if (p.asaasLinhaDigitavel) {
                      <button mat-button class="!min-w-0 !px-2" type="button" (click)="copiar(p.asaasLinhaDigitavel)">
                        Copiar linha digitável
                      </button>
                    }
                    @if (p.asaasPixCopiaECola) {
                      @if (p.asaasPixQrCodeImagem) {
                        <img class="w-32 h-32" [src]="'data:image/png;base64,' + p.asaasPixQrCodeImagem" alt="QR Code Pix" />
                      }
                      <button mat-button class="!min-w-0 !px-2" type="button" (click)="copiar(p.asaasPixCopiaECola)">
                        Copiar código Pix
                      </button>
                    }
                    @if (p.asaasBillingType === "CREDIT_CARD" && p.asaasInvoiceUrl) {
                      <a mat-button class="!min-w-0 !px-2" [href]="p.asaasInvoiceUrl" target="_blank" rel="noopener">Pagar com cartão</a>
                    }
                  } @else if (formaDe(p)) {
                    <button mat-flat-button color="primary" type="button" [disabled]="gerando() === p.id" (click)="gerar(p, formaDe(p)!)">
                      {{ gerando() === p.id ? "Gerando..." : (formaDe(p) === "CREDIT_CARD" && provedorCartao() === "REDE" ? "Pagar com cartão" : "Emitir " + rotuloForma(formaDe(p)!)) }}
                    </button>
                  } @else {
                    <button mat-flat-button color="primary" type="button" [disabled]="gerando() === p.id" [matMenuTriggerFor]="menu">
                      {{ gerando() === p.id ? "Gerando..." : "Pagar" }}
                    </button>
                    <mat-menu #menu="matMenu">
                      @for (f of formas(); track f) {
                        <button mat-menu-item type="button" (click)="gerar(p, f)">{{ rotuloForma(f) }}</button>
                      }
                    </mat-menu>
                  }
                }
              </td>
            </tr>
          } @empty {
            <tr><td class="p-4 text-gray-500" colspan="10">Nenhum pagamento encontrado.</td></tr>
          }
        </tbody>
      </table>
    </div>
    <p class="text-xs mt-2 text-gray-600">
      <span class="text-blue-700 font-medium">Azul:</span> em aberto, ainda não vencido ·
      <span class="text-red-700 font-medium">Vermelho:</span> em aberto e vencido ·
      <span class="text-green-700 font-medium">Verde:</span> pago.
    </p>
  `,
})
export class PortalPagamentosComponent implements OnInit {
  private readonly portal = inject(PortalService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** Recebido só para manter a mesma interface das outras abas. */
  readonly matriculas = input.required<PortalMatricula[]>();
  readonly parcelas = signal<PortalParcela[]>([]);
  readonly formas = signal<FormaPagamento[]>(["BOLETO", "PIX"]);
  readonly gerando = signal<string | null>(null);
  /** Cartão pela Rede = formulário no portal; pelo Asaas = fatura hospedada (link). */
  readonly provedorCartao = signal<"ASAAS" | "REDE" | null>(null);
  readonly cartaoMaxParcelas = signal(1);

  ngOnInit(): void {
    this.carregar();
    this.portal.configuracaoPagamento().subscribe({
      next: (c) => {
        this.formas.set(c.formas);
        this.provedorCartao.set(c.provedorCartao);
        this.cartaoMaxParcelas.set(c.cartaoMaxParcelas);
      },
      error: () => undefined,
    });
  }

  private carregar(): void {
    this.portal.parcelas().subscribe((p) => this.parcelas.set(p));
  }

  rotulo(p: PortalParcela): string {
    if (p.status === "EM_ABERTO" && this.vencida(p)) return "Vencida";
    return ROTULO_STATUS[p.status] ?? p.status;
  }

  /** Azul = em aberto a vencer; vermelho = vencida; verde = paga (legenda do Universa). */
  classeLinha(p: PortalParcela): string {
    if (p.status === "PAGO") return "text-green-700";
    if (this.vencida(p)) return "text-red-700";
    if (p.status === "EM_ABERTO") return "text-blue-700";
    return "text-gray-500";
  }

  vencida(p: PortalParcela): boolean {
    return p.status === "EM_ABERTO" && new Date(p.vencimento).getTime() < Date.now() - 24 * 3600 * 1000;
  }

  rotuloForma(f: FormaPagamento): string {
    return ROTULO_FORMA_PAGAMENTO[f];
  }

  /** Forma já definida no cadastro (e ainda habilitada); senão o aluno escolhe. */
  formaDe(p: PortalParcela): FormaPagamento | null {
    return p.formaPagamento && this.formas().includes(p.formaPagamento) ? p.formaPagamento : null;
  }

  /** Abre o formulário de cartão (Rede); ao aprovar, a parcela passa a Paga. */
  pagarNoCartao(p: PortalParcela): void {
    this.dialog
      .open(PortalCartaoDialogComponent, {
        width: "420px",
        maxWidth: "95vw",
        disableClose: true,
        autoFocus: "input",
        data: {
          parcelaId: p.id,
          descricao: `${p.tipoTitulo ?? "Parcela"} - ${p.parcela.replace("/", " / ")}`,
          valor: Number(p.valor),
          maxParcelas: this.cartaoMaxParcelas(),
        },
      })
      .afterClosed()
      .subscribe((r) => {
        if (!r?.aprovado) return;
        this.snackBar.open(
          `Pagamento aprovado${r.final ? ` — cartão final ${r.final}` : ""}`,
          "Fechar",
          { duration: 6000 },
        );
        this.carregar();
      });
  }

  gerar(p: PortalParcela, forma: FormaPagamento): void {
    if (forma === "CREDIT_CARD" && this.provedorCartao() === "REDE") {
      this.pagarNoCartao(p);
      return;
    }
    this.gerando.set(p.id);
    this.portal.gerarCobranca(p.id, forma).subscribe({
      next: (c) => {
        this.gerando.set(null);
        this.carregar();
        if (c.asaasBoletoUrl) window.open(c.asaasBoletoUrl, "_blank", "noopener");
        else if (c.asaasBillingType === "CREDIT_CARD" && c.asaasInvoiceUrl) {
          window.open(c.asaasInvoiceUrl, "_blank", "noopener");
        }
      },
      error: () => this.gerando.set(null),
    });
  }

  copiar(texto: string): void {
    navigator.clipboard
      .writeText(texto)
      .then(() => this.snackBar.open("Copiado", "Fechar", { duration: 2000 }))
      .catch(() => this.snackBar.open("Não foi possível copiar", "Fechar", { duration: 3000 }));
  }
}
