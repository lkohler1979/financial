import { CurrencyPipe, DatePipe } from "@angular/common";
import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { catchError, debounceTime, merge, of, Subject, switchMap } from "rxjs";
import { PlanoRenegociacao } from "../../core/models/renegociacao.model";
import { CobrancaService } from "../../core/services/cobranca.service";

/** Parcela candidata à renegociação, com o que a ficha já mostra dela (estado e encargos de hoje). */
export interface LinhaRenegociacao {
  id: string;
  parcela: string;
  codTitulo: string;
  vencimento: string;
  estado: string;
  valor: number;
  multa: number;
  juros: number;
  total: number;
}

export interface DadosRenegociacao {
  matriculaId: string;
  /** Só parcelas ainda não pagas, na ordem do vencimento. */
  linhas: LinhaRenegociacao[];
}

/** AAAA-MM-DD de hoje + `dias`, no fuso local. */
function dataEmDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Renegociar dívida: escolhe as parcelas não pagas, soma o que se deve, aplica o desconto e define
 * em quantas vezes e a partir de que data. Os números mostrados vêm da simulação do servidor — a
 * mesma regra que grava ao confirmar.
 */
@Component({
  selector: "app-renegociar-divida-dialog",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Renegociar dívida</h2>
    <mat-dialog-content class="!max-h-[75vh]">
      <p class="text-xs text-gray-500 mb-2">
        Escolha as parcelas que ainda não foram pagas. Elas ficam como <strong>Renegociada</strong>
        (situação QUITADO POR RENEGOCIAÇÃO) e são trocadas por novas parcelas, ligadas a elas.
      </p>

      @if (dados.linhas.length === 0) {
        <p class="text-sm text-gray-500 py-4">Não há parcelas em aberto para renegociar.</p>
      } @else {
        <table class="w-full text-sm" data-testid="parcelas-renegociaveis">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 w-10">
                <mat-checkbox
                  aria-label="Selecionar todas"
                  [checked]="todasSelecionadas()"
                  [indeterminate]="algumaSelecionada() && !todasSelecionadas()"
                  (change)="selecionarTodas($event.checked)"
                />
              </th>
              <th class="py-1 font-medium">Parcela</th>
              <th class="py-1 font-medium">Título</th>
              <th class="py-1 font-medium">Vencimento</th>
              <th class="py-1 font-medium">Estado</th>
              <th class="py-1 font-medium text-right">Valor</th>
              <th class="py-1 font-medium text-right">Multa</th>
              <th class="py-1 font-medium text-right">Juros</th>
              <th class="py-1 font-medium text-right">Total</th>
            </tr>
          </thead>
          @for (linha of dados.linhas; track linha.id) {
            <tr class="text-gray-600 border-t" [class.bg-blue-50]="selecionadas().has(linha.id)">
              <td class="py-1">
                <mat-checkbox
                  [attr.aria-label]="'Selecionar parcela ' + linha.parcela"
                  [checked]="selecionadas().has(linha.id)"
                  (change)="alternar(linha.id, $event.checked)"
                />
              </td>
              <td class="py-1">{{ linha.parcela }}</td>
              <td class="py-1">{{ linha.codTitulo }}</td>
              <td class="py-1">{{ linha.vencimento | date: "dd/MM/yyyy" : "UTC" }}</td>
              <td class="py-1">{{ linha.estado }}</td>
              <td class="py-1 text-right">{{ linha.valor | currency: "BRL" }}</td>
              <td class="py-1 text-right">{{ linha.multa | currency: "BRL" }}</td>
              <td class="py-1 text-right">{{ linha.juros | currency: "BRL" }}</td>
              <td class="py-1 text-right">{{ linha.total | currency: "BRL" }}</td>
            </tr>
          }
          <tr class="border-t font-medium" data-testid="soma-selecionadas">
            <td class="py-1" colspan="5">
              Soma das parcelas selecionadas ({{ selecionadas().size }})
            </td>
            <td class="py-1 text-right">{{ somaSelecionadas().valor | currency: "BRL" }}</td>
            <td class="py-1 text-right">{{ somaSelecionadas().multa | currency: "BRL" }}</td>
            <td class="py-1 text-right">{{ somaSelecionadas().juros | currency: "BRL" }}</td>
            <td class="py-1 text-right">{{ somaSelecionadas().total | currency: "BRL" }}</td>
          </tr>
        </table>

        <form [formGroup]="form" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Desconto (R$)</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="desconto" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Quantidade de parcelas</mat-label>
            <input
              matInput
              type="number"
              min="1"
              max="60"
              step="1"
              formControlName="numeroParcelas"
            />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Data da primeira parcela</mat-label>
            <input matInput type="date" [min]="hoje" formControlName="primeiroVencimento" />
          </mat-form-field>
        </form>
        <p class="text-[11px] text-gray-400 mt-1">
          As demais parcelas vencem no mesmo dia dos meses seguintes.
        </p>

        @if (simulando()) {
          <mat-progress-bar mode="indeterminate" class="mt-3"></mat-progress-bar>
        }
        @if (erro()) {
          <p class="text-sm text-red-600 mt-3" role="alert">{{ erro() }}</p>
        }

        @if (plano(); as p) {
          <div class="mt-4 rounded-lg border p-3 bg-gray-50" data-testid="resumo-renegociacao">
            <dl class="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-2 text-sm m-0">
              <div>
                <dt class="text-xs text-gray-500">Valor das parcelas</dt>
                <dd class="m-0">{{ p.valorOriginal | currency: "BRL" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500">Multa</dt>
                <dd class="m-0">{{ p.multa | currency: "BRL" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500">Juros</dt>
                <dd class="m-0">{{ p.juros | currency: "BRL" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500">Total devido</dt>
                <dd class="m-0">{{ p.totalDevido | currency: "BRL" }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500">Desconto</dt>
                <dd class="m-0">- {{ p.desconto | currency: "BRL" }}</dd>
              </div>
            </dl>
            <p class="text-base font-semibold mt-3 mb-0">
              Valor a cobrar: {{ p.valorNegociado | currency: "BRL" }} em
              {{ p.novasParcelas.length }}x
            </p>

            <table class="w-full text-sm mt-2" data-testid="novas-parcelas">
              <thead>
                <tr class="text-left text-xs text-gray-400">
                  <th class="py-1 font-medium">Nova parcela</th>
                  <th class="py-1 font-medium">Vencimento</th>
                  <th class="py-1 font-medium text-right">Valor</th>
                </tr>
              </thead>
              @for (n of p.novasParcelas; track n.numero) {
                <tr class="text-gray-600 border-t">
                  <td class="py-1">{{ n.numero }}/{{ p.novasParcelas.length }}</td>
                  <td class="py-1">{{ n.vencimento | date: "dd/MM/yyyy" : "UTC" }}</td>
                  <td class="py-1 text-right">{{ n.valor | currency: "BRL" }}</td>
                </tr>
              }
            </table>
          </div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="gravando()" (click)="fechar.close(false)">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!podeConfirmar()"
        (click)="confirmar()"
      >
        Renegociar
      </button>
    </mat-dialog-actions>
  `,
})
export class RenegociarDividaDialogComponent implements OnInit {
  readonly dados = inject<DadosRenegociacao>(MAT_DIALOG_DATA);
  readonly fechar = inject<MatDialogRef<RenegociarDividaDialogComponent, boolean>>(MatDialogRef);
  private readonly service = inject(CobrancaService);
  private readonly destroyRef = inject(DestroyRef);

  readonly hoje = dataEmDias(0);
  readonly form = inject(FormBuilder).nonNullable.group({
    desconto: [0, [Validators.required, Validators.min(0)]],
    numeroParcelas: [1, [Validators.required, Validators.min(1), Validators.max(60)]],
    primeiroVencimento: [dataEmDias(30), Validators.required],
  });

  readonly selecionadas = signal<Set<string>>(new Set());
  readonly plano = signal<PlanoRenegociacao | null>(null);
  readonly erro = signal<string | null>(null);
  readonly simulando = signal(false);
  readonly gravando = signal(false);

  private readonly selecaoMudou = new Subject<void>();

  ngOnInit(): void {
    // Qualquer mudança (seleção ou campos) refaz a simulação, sem disparar a cada tecla.
    merge(this.selecaoMudou, this.form.valueChanges)
      .pipe(
        debounceTime(300),
        switchMap(() => {
          this.plano.set(null);
          this.erro.set(null);
          const ids = [...this.selecionadas()];
          if (ids.length === 0 || this.form.invalid) return of(null);
          this.simulando.set(true);
          const v = this.form.getRawValue();
          return this.service
            .simularRenegociacao(this.dados.matriculaId, {
              parcelaIds: ids,
              desconto: Number(v.desconto),
              numeroParcelas: Number(v.numeroParcelas),
              primeiroVencimento: v.primeiroVencimento,
            })
            .pipe(
              catchError((err) => {
                this.erro.set(err?.error?.mensagem ?? "Não foi possível calcular a renegociação");
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((plano) => {
        this.simulando.set(false);
        this.plano.set(plano);
      });
  }

  todasSelecionadas(): boolean {
    return this.dados.linhas.length > 0 && this.selecionadas().size === this.dados.linhas.length;
  }

  algumaSelecionada(): boolean {
    return this.selecionadas().size > 0;
  }

  selecionarTodas(marcar: boolean): void {
    this.selecionadas.set(new Set(marcar ? this.dados.linhas.map((l) => l.id) : []));
    this.selecaoMudou.next();
  }

  alternar(id: string, marcar: boolean): void {
    const novas = new Set(this.selecionadas());
    if (marcar) novas.add(id);
    else novas.delete(id);
    this.selecionadas.set(novas);
    this.selecaoMudou.next();
  }

  /** Soma imediata (antes da simulação responder), com o que a ficha já calculou de cada parcela. */
  somaSelecionadas(): { valor: number; multa: number; juros: number; total: number } {
    const escolhidas = this.dados.linhas.filter((l) => this.selecionadas().has(l.id));
    const somar = (f: (l: LinhaRenegociacao) => number) =>
      Math.round(escolhidas.reduce((s, l) => s + Math.round(f(l) * 100), 0)) / 100;
    return {
      valor: somar((l) => l.valor),
      multa: somar((l) => l.multa),
      juros: somar((l) => l.juros),
      total: somar((l) => l.total),
    };
  }

  podeConfirmar(): boolean {
    return this.plano() !== null && !this.simulando() && !this.gravando() && !this.erro();
  }

  confirmar(): void {
    if (!this.podeConfirmar()) return;
    const v = this.form.getRawValue();
    this.gravando.set(true);
    this.service
      .renegociar(this.dados.matriculaId, {
        parcelaIds: [...this.selecionadas()],
        desconto: Number(v.desconto),
        numeroParcelas: Number(v.numeroParcelas),
        primeiroVencimento: v.primeiroVencimento,
      })
      .subscribe({
        next: () => this.fechar.close(true),
        error: (err) => {
          this.gravando.set(false);
          this.erro.set(err?.error?.mensagem ?? "Não foi possível renegociar");
        },
      });
  }
}
