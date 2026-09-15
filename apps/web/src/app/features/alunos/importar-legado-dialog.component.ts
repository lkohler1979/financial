import { Component, inject } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar } from "@angular/material/snack-bar";
import {
  ImportacaoLegadoService,
  PreviaCursoLegado,
  PreviaImportacaoLegado,
} from "../../core/services/importacao-legado.service";
import { CursosService } from "../../core/services/cursos.service";
import { Curso } from "../../core/models/curso.model";
import { formatarCpf, normalizarCpf } from "../../shared/utils/cpf.util";

interface CursoSelecao extends PreviaCursoLegado {
  importar: boolean;
  cursoEthosId: string | null;
}

@Component({
  selector: "app-importar-legado-dialog",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    CurrencyPipe,
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Consultar aluno no sistema legado</h2>

    <mat-dialog-content>
      <div class="flex items-end gap-2 mb-4">
        <mat-form-field appearance="outline" class="flex-1">
          <mat-label>CPF</mat-label>
          <input matInput [formControl]="cpf" maxlength="14" (keyup.enter)="buscar()" />
        </mat-form-field>
        <button
          mat-raised-button
          color="primary"
          [disabled]="cpf.invalid || buscando"
          (click)="buscar()"
        >
          Buscar
        </button>
      </div>

      @if (buscando) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      @if (naoEncontrado) {
        <p class="text-gray-500">CPF não encontrado no sistema legado.</p>
      }

      @if (previa && previa.encontrado) {
        <div class="mb-4">
          <p class="m-0">
            <strong>{{ previa.nome }}</strong> — {{ formatarCpf(previa.cpf) }}
          </p>
          @if (previa.alunoJaExiste) {
            <p class="text-sm text-amber-700 m-0">
              Este aluno já existe no Ethos — só o que faltar será importado.
            </p>
          } @else {
            <p class="text-sm text-gray-500 m-0">Aluno ainda não cadastrado no Ethos.</p>
          }
        </div>

        @for (curso of cursosSelecao; track curso.alunocursoId) {
          <div class="border rounded p-3 mb-3">
            <div class="flex items-center gap-2 mb-2">
              <mat-checkbox [(ngModel)]="curso.importar" [ngModelOptions]="{ standalone: true }">
                Importar
              </mat-checkbox>
              <span class="font-medium">{{ curso.cursoLegadoNome }}</span>
              @if (curso.matriculaJaExiste) {
                <span class="text-xs text-amber-700">(matrícula já existe no Ethos)</span>
              }
            </div>

            <mat-form-field appearance="outline" class="w-full max-w-md mb-2">
              <mat-label>Curso correspondente no Ethos</mat-label>
              <mat-select [(ngModel)]="curso.cursoEthosId" [ngModelOptions]="{ standalone: true }">
                @for (c of cursosEthos; track c.id) {
                  <mat-option [value]="c.id">{{ c.codigo }} — {{ c.nome }}</mat-option>
                }
              </mat-select>
              @if (!curso.cursoEthosSugerido) {
                <mat-hint class="text-amber-700">
                  Nenhum curso do Ethos bate com o nome do legado — selecione manualmente.
                </mat-hint>
              }
            </mat-form-field>

            @if (curso.parcelas.length > 0) {
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500">
                    <th class="pr-2">Parcela</th>
                    <th class="pr-2">Vencimento</th>
                    <th class="pr-2">Valor</th>
                    <th class="pr-2">Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of curso.parcelas; track p.tituloId) {
                    <tr [class.text-gray-400]="p.jaExisteNoEthos">
                      <td class="pr-2">{{ p.parcela }}</td>
                      <td class="pr-2">{{ p.vencimento | date: "dd/MM/yyyy" }}</td>
                      <td class="pr-2">{{ p.valor | currency: "BRL" }}</td>
                      <td class="pr-2">{{ p.estado }}</td>
                      <td>
                        @if (p.jaExisteNoEthos) {
                          <span class="text-xs">já existe no Ethos</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="text-sm text-gray-500 m-0">Nenhuma parcela encontrada no legado para este curso.</p>
            }
          </div>
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Fechar</button>
      @if (previa && previa.encontrado) {
        <button
          mat-raised-button
          color="primary"
          [disabled]="!podeConfirmar() || importando"
          (click)="confirmar()"
        >
          Importar selecionados
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class ImportarLegadoDialogComponent {
  private readonly service = inject(ImportacaoLegadoService);
  private readonly cursosService = inject(CursosService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<ImportarLegadoDialogComponent>);
  protected readonly formatarCpf = formatarCpf;

  readonly cpf = new FormControl("", { nonNullable: true, validators: [Validators.required] });

  buscando = false;
  importando = false;
  naoEncontrado = false;
  previa: PreviaImportacaoLegado | null = null;
  cursosSelecao: CursoSelecao[] = [];
  cursosEthos: Curso[] = [];

  constructor() {
    // Lista completa de cursos ativos para o mapeamento manual (decisão do
    // usuário: nunca criar curso automaticamente a partir do legado).
    this.cursosService.listar({ situacao: true, pageSize: 500 }).subscribe((res) => {
      this.cursosEthos = res.data;
    });
  }

  buscar(): void {
    if (this.cpf.invalid) return;
    this.buscando = true;
    this.naoEncontrado = false;
    this.previa = null;
    this.cursosSelecao = [];

    this.service.buscarPorCpf(normalizarCpf(this.cpf.value)).subscribe({
      next: (res) => {
        this.buscando = false;
        this.previa = res;
        this.naoEncontrado = !res.encontrado;
        this.cursosSelecao = res.cursos.map((c) => ({
          ...c,
          importar: !c.matriculaJaExiste,
          cursoEthosId: c.cursoEthosSugerido?.id ?? null,
        }));
      },
      error: () => (this.buscando = false),
    });
  }

  podeConfirmar(): boolean {
    const selecionados = this.cursosSelecao.filter((c) => c.importar);
    return selecionados.length > 0 && selecionados.every((c) => !!c.cursoEthosId);
  }

  confirmar(): void {
    if (!this.previa || !this.podeConfirmar()) return;
    this.importando = true;

    const selecoes = this.cursosSelecao
      .filter((c) => c.importar)
      .map((c) => ({ alunocursoId: c.alunocursoId, cursoEthosId: c.cursoEthosId as string }));

    this.service.confirmar({ cpf: this.previa.cpf, selecoes }).subscribe({
      next: (res) => {
        this.importando = false;
        this.snackBar.open(
          `Importado: ${res.matriculasNovas} matrícula(s), ${res.parcelasNovas} parcela(s) nova(s).`,
          "Fechar",
          { duration: 5000 },
        );
        this.ref.close(true);
      },
      error: () => (this.importando = false),
    });
  }
}
