import { CurrencyPipe } from "@angular/common";
import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { PortalResultadoCartao } from "../../core/models/portal.model";
import { PortalService } from "../../core/services/portal.service";

export interface PortalCartaoDialogData {
  parcelaId: string;
  descricao: string;
  valor: number;
  maxParcelas: number;
}

/** "5448280000000007" → "5448 2800 0000 0007" (até 19 dígitos). */
function mascararNumero(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "0135" → "01/35". */
function mascararValidade(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/**
 * Pagamento no cartão de crédito (Rede). Os dados do cartão existem só nesta
 * tela e na chamada de pagamento: não vão para localStorage, URL nem console, e
 * são apagados ao fechar.
 */
@Component({
  selector: "app-portal-cartao-dialog",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Pagar com cartão de crédito</h2>
    <mat-dialog-content class="!pt-2">
      <p class="text-sm text-gray-600 mb-3">
        {{ data.descricao }} — <strong>{{ data.valor | currency: "BRL" }}</strong>
      </p>

      <form (ngSubmit)="pagar()" autocomplete="on" class="grid gap-3" #f="ngForm">
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Número do cartão</span>
          <input
            class="border rounded px-2 py-2 w-full"
            name="cc-number"
            autocomplete="cc-number"
            inputmode="numeric"
            [ngModel]="numero"
            (ngModelChange)="numero = mascarar($event)"
            required
          />
        </label>
        <label class="text-sm">
          <span class="block text-xs text-gray-500">Nome impresso no cartão</span>
          <input
            class="border rounded px-2 py-2 w-full uppercase"
            name="cc-name"
            autocomplete="cc-name"
            maxlength="30"
            [(ngModel)]="nome"
            required
          />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Validade (MM/AA)</span>
            <input
              class="border rounded px-2 py-2 w-full"
              name="cc-exp"
              autocomplete="cc-exp"
              inputmode="numeric"
              placeholder="MM/AA"
              [ngModel]="validade"
              (ngModelChange)="validade = mascararVal($event)"
              required
            />
          </label>
          <label class="text-sm">
            <span class="block text-xs text-gray-500">CVV</span>
            <input
              class="border rounded px-2 py-2 w-full"
              name="cc-csc"
              type="password"
              autocomplete="cc-csc"
              inputmode="numeric"
              maxlength="4"
              [(ngModel)]="cvv"
              required
            />
          </label>
        </div>
        @if (data.maxParcelas > 1) {
          <label class="text-sm">
            <span class="block text-xs text-gray-500">Parcelas</span>
            <select class="border rounded px-2 py-2 w-full" name="parcelas" [(ngModel)]="parcelas">
              @for (n of opcoesParcelas(); track n) {
                <option [ngValue]="n">
                  {{ n === 1 ? "À vista" : n + "x de " + (data.valor / n | currency: "BRL") }}
                </option>
              }
            </select>
          </label>
        }

        @if (erro()) {
          <p class="text-sm text-red-600 m-0">{{ erro() }}</p>
        }
        <p class="text-xs text-gray-500 m-0">
          Seus dados são enviados com segurança à Rede e não ficam guardados no sistema.
        </p>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="fechar()" [disabled]="pagando()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" (click)="pagar()" [disabled]="pagando()">
        {{ pagando() ? "Processando..." : "Pagar " + (data.valor | currency: "BRL") }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PortalCartaoDialogComponent {
  protected readonly data = inject<PortalCartaoDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PortalCartaoDialogComponent, PortalResultadoCartao | undefined>);
  private readonly portal = inject(PortalService);

  numero = "";
  nome = "";
  validade = "";
  cvv = "";
  parcelas = 1;

  readonly pagando = signal(false);
  readonly erro = signal("");

  protected readonly mascarar = mascararNumero;
  protected readonly mascararVal = mascararValidade;

  opcoesParcelas(): number[] {
    return Array.from({ length: this.data.maxParcelas }, (_, i) => i + 1);
  }

  pagar(): void {
    const [mes, ano] = this.validade.split("/");
    if (!this.numero || !this.nome.trim() || !mes || !ano || ano.length < 2 || !this.cvv) {
      this.erro.set("Preencha todos os dados do cartão");
      return;
    }
    this.pagando.set(true);
    this.erro.set("");
    this.portal
      .pagarComCartao(this.data.parcelaId, {
        numero: this.numero,
        nome: this.nome,
        mes: Number(mes),
        ano: Number(ano),
        cvv: this.cvv,
        parcelas: this.parcelas,
      })
      .subscribe({
        next: (r) => {
          this.limpar();
          this.ref.close(r);
        },
        error: (e) => {
          this.pagando.set(false);
          // O CVV nunca fica na tela depois de uma tentativa; o resto o aluno corrige.
          this.cvv = "";
          this.erro.set(e?.error?.detalhes?.[0]?.mensagem ?? e?.error?.mensagem ?? "Não foi possível processar o pagamento");
        },
      });
  }

  fechar(): void {
    this.limpar();
    this.ref.close(undefined);
  }

  private limpar(): void {
    this.numero = this.nome = this.validade = this.cvv = "";
  }
}
