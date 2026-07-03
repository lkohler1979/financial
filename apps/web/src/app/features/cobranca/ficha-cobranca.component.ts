import { Component, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatSelectModule } from "@angular/material/select";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import { CobrancaService } from "../../core/services/cobranca.service";
import { FinanceiroService } from "../../core/services/financeiro.service";
import { FichaCobranca, SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import { Parcela } from "../../core/models/parcela.model";
import { formatarCpf } from "../../shared/utils/cpf.util";

@Component({
  selector: "app-ficha-cobranca",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    @if (carregando) {
      <mat-progress-bar mode="indeterminate" class="mb-4"></mat-progress-bar>
    }

    @if (ficha) {
      <div class="flex items-start justify-between mb-5">
        <div>
          <h1 class="text-2xl font-medium m-0">{{ ficha.matricula.aluno?.nome }}</h1>
          <p class="text-sm text-gray-500 mt-1">
            CPF {{ formatarCpf(ficha.matricula.aluno?.cpf || "") }} ·
            {{ ficha.matricula.curso?.nome }}
            @if (ficha.matricula.numeroMatricula) {
              · matrícula {{ ficha.matricula.numeroMatricula }}
            }
          </p>
        </div>
        <a mat-stroked-button [routerLink]="['/matriculas', ficha.matricula.id]">
          <mat-icon>edit</mat-icon> Editar matrícula
        </a>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div class="bg-white rounded-xl border p-5">
          <p class="text-xs font-medium text-gray-600 mb-2">Situação da cobrança</p>
          <mat-form-field appearance="outline" class="w-full">
            <mat-select [formControl]="situacaoControl" (selectionChange)="mudarSituacao($event.value)">
              @for (situacao of situacoes; track situacao.id) {
                <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <p class="text-xs font-medium text-gray-600 mb-2 mt-3">Tags</p>
          <div class="flex gap-2 flex-wrap items-center">
            <mat-chip-set>
              @for (tag of ficha.tags; track tag.id) {
                <mat-chip [removable]="true" (removed)="removerTag(tag)">
                  {{ tag.nome }}
                  <mat-icon matChipRemove aria-label="Remover tag">cancel</mat-icon>
                </mat-chip>
              }
            </mat-chip-set>
            <mat-form-field appearance="outline" class="!w-40 !text-xs" subscriptSizing="dynamic">
              <mat-select placeholder="+ Adicionar" (selectionChange)="adicionarTag($event.value)">
                @for (tag of tagsDisponiveis(); track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </div>

        <div class="bg-white rounded-xl border p-5">
          <p class="text-xs font-medium text-gray-600 mb-3">Parcelas em aberto</p>
          <table class="w-full text-sm">
            @for (parcela of parcelas; track parcela.id) {
              <tr class="text-gray-600">
                <td class="py-0.5">{{ parcela.vencimento | date: "dd/MM/yyyy" }}</td>
                <td class="py-0.5 text-right">{{ parcela.valor | currency: "BRL" }}</td>
              </tr>
            }
            @if (parcelas.length === 0) {
              <tr>
                <td class="text-gray-400 py-2">Nenhuma parcela em aberto.</td>
              </tr>
            }
            @if (parcelas.length > 0) {
              <tr class="border-t font-medium">
                <td class="py-1">Total devedor</td>
                <td class="py-1 text-right">{{ totalDevedor() | currency: "BRL" }}</td>
              </tr>
            }
          </table>
        </div>
      </div>

      <div class="bg-white rounded-xl border p-5 mb-5">
        <p class="text-xs font-medium text-gray-600 mb-3">Nova observação</p>
        <div class="flex gap-2">
          <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
            <input
              matInput
              [formControl]="novaObservacao"
              placeholder="Ligação realizada, cliente informou..."
              (keydown.enter)="adicionarObservacao()"
            />
          </mat-form-field>
          <button mat-stroked-button (click)="adicionarObservacao()">Adicionar</button>
        </div>
      </div>

      <div>
        <p class="text-xs font-medium text-gray-600 mb-3">Histórico</p>
        <div class="flex flex-col gap-3">
          @for (item of ficha.historico; track item.id) {
            <div class="flex gap-3">
              <div class="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 flex-shrink-0"></div>
              <div>
                <p class="text-sm m-0">{{ item.acao }}</p>
                <p class="text-xs text-gray-400 mt-0.5 mb-0">
                  {{ item.data | date: "dd/MM" }} · {{ item.usuario?.nome }}
                </p>
              </div>
            </div>
          }
          @if (ficha.historico.length === 0) {
            <p class="text-gray-400 text-sm">Nenhum evento registrado ainda.</p>
          }
        </div>
      </div>
    }
  `,
})
export class FichaCobrancaComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(CobrancaService);
  private readonly financeiroService = inject(FinanceiroService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly formatarCpf = formatarCpf;

  matriculaId = "";
  ficha?: FichaCobranca;
  situacoes: SituacaoCobranca[] = [];
  todasTags: Tag[] = [];
  parcelas: Parcela[] = [];
  carregando = false;

  readonly situacaoControl = new FormControl<string | undefined>(undefined);
  readonly novaObservacao = new FormControl("", { nonNullable: true });

  ngOnInit(): void {
    this.matriculaId = this.route.snapshot.paramMap.get("matriculaId") ?? "";
    this.service.listarSituacoes(true).subscribe((res) => (this.situacoes = res));
    this.service.listarTags().subscribe((res) => (this.todasTags = res));
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.service.obterFicha(this.matriculaId).subscribe({
      next: (ficha) => {
        this.ficha = ficha;
        this.situacaoControl.setValue(ficha.matricula.situacaoCobrancaId ?? undefined, {
          emitEvent: false,
        });
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });

    this.financeiroService
      .listar({ matriculaId: this.matriculaId, status: "EM_ABERTO", pageSize: 100 })
      .subscribe((res) => (this.parcelas = res.data));
  }

  tagsDisponiveis(): Tag[] {
    const idsAtuais = new Set((this.ficha?.tags ?? []).map((t) => t.id));
    return this.todasTags.filter((t) => !idsAtuais.has(t.id));
  }

  totalDevedor(): number {
    return this.parcelas.reduce((soma, p) => soma + Number(p.valor), 0);
  }

  mudarSituacao(situacaoCobrancaId: string): void {
    this.service.mudarSituacao(this.matriculaId, situacaoCobrancaId).subscribe(() => {
      this.snackBar.open("Situação atualizada", "Fechar", { duration: 3000 });
      this.carregar();
    });
  }

  adicionarTag(tagId: string): void {
    this.service.adicionarTag(this.matriculaId, tagId).subscribe(() => this.carregar());
  }

  removerTag(tag: Tag): void {
    this.service.removerTag(this.matriculaId, tag.id).subscribe(() => this.carregar());
  }

  adicionarObservacao(): void {
    const texto = this.novaObservacao.value.trim();
    if (!texto) return;

    this.service.adicionarObservacao(this.matriculaId, texto).subscribe(() => {
      this.novaObservacao.setValue("");
      this.carregar();
    });
  }
}
