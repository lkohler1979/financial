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
  PreviaParcelaLegado,
} from "../../core/services/importacao-legado.service";
import { CursosService } from "../../core/services/cursos.service";
import { Curso } from "../../core/models/curso.model";
import { formatarCpf, normalizarCpf } from "../../shared/utils/cpf.util";

interface ParcelaSelecao extends PreviaParcelaLegado {
  selecionada: boolean;
}

interface CursoSelecao extends Omit<PreviaCursoLegado, "parcelas"> {
  importarMatricula: boolean;
  cursoEthosId: string | null;
  editandoAssociacao: boolean;
  parcelas: ParcelaSelecao[];
}

/** Curso habilitado a importar parcelas: matrícula já existe, ou o usuário
 * marcou para importar aluno/matrícula junto (pedido do usuário, 2026-09-15). */
function cursoHabilitado(curso: CursoSelecao): boolean {
  return curso.matriculaJaExiste || curso.importarMatricula;
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
              Este aluno já existe no Ethos — só o que faltar será importado/atualizado.
            </p>
          } @else {
            <p class="text-sm text-gray-500 m-0">Aluno ainda não cadastrado no Ethos.</p>
          }
        </div>

        @for (curso of cursosSelecao; track curso.alunocursoId) {
          <div class="border rounded p-3 mb-3">
            <div class="flex items-center gap-2 mb-2 flex-wrap">
              @if (!curso.matriculaJaExiste) {
                <mat-checkbox
                  [(ngModel)]="curso.importarMatricula"
                  [ngModelOptions]="{ standalone: true }"
                >
                  Importar aluno/matrícula
                </mat-checkbox>
              } @else {
                <mat-icon class="text-green-700" inline>check_circle</mat-icon>
              }
              <span class="font-medium">{{ curso.cursoLegadoNome }}</span>
              @if (curso.matriculaJaExiste) {
                <span class="text-xs text-gray-500">(matrícula já existe no Ethos)</span>
              }
            </div>

            <div class="mb-2">
              @if (curso.cursoEthosSugerido && !curso.editandoAssociacao) {
                <div class="flex items-center gap-2 text-sm">
                  <mat-icon class="text-green-700" inline>link</mat-icon>
                  <span>
                    Associado a <strong>{{ curso.cursoEthosSugerido.codigo }} — {{ curso.cursoEthosSugerido.nome }}</strong>
                  </span>
                  <button mat-button (click)="curso.editandoAssociacao = true">Trocar</button>
                </div>
              } @else {
                <mat-form-field appearance="outline" class="w-full max-w-md">
                  <mat-label>Curso correspondente no Ethos</mat-label>
                  <mat-select [(ngModel)]="curso.cursoEthosId" [ngModelOptions]="{ standalone: true }">
                    @for (c of cursosEthos; track c.id) {
                      <mat-option [value]="c.id">{{ c.codigo }} — {{ c.nome }}</mat-option>
                    }
                  </mat-select>
                  <mat-hint class="text-amber-700">
                    Nenhum curso do Ethos bate com o nome do legado — selecione manualmente.
                  </mat-hint>
                </mat-form-field>
              }
            </div>

            @if (curso.parcelas.length > 0) {
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500">
                    <th></th>
                    <th class="pr-2">Parcela</th>
                    <th class="pr-2">Vencimento</th>
                    <th class="pr-2">Valor</th>
                    <th class="pr-2">Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of curso.parcelas; track p.tituloId) {
                    <tr>
                      <td>
                        <mat-checkbox
                          [(ngModel)]="p.selecionada"
                          [ngModelOptions]="{ standalone: true }"
                          [disabled]="!cursoHabilitado(curso)"
                        ></mat-checkbox>
                      </td>
                      <td class="pr-2">{{ p.parcela }}</td>
                      <td class="pr-2">{{ p.vencimento | date: "dd/MM/yyyy" }}</td>
                      <td class="pr-2">{{ p.valor | currency: "BRL" }}</td>
                      <td class="pr-2">{{ p.estado }}</td>
                      <td class="text-xs text-gray-500">
                        @if (p.jaExisteNoEthos) {
                          <span>atualizar{{ p.pagoNoLegado ? " (paga)" : "" }}</span>
                        } @else {
                          <span>{{ p.pagoNoLegado ? "criar (paga)" : "criar" }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
              @if (!cursoHabilitado(curso)) {
                <p class="text-xs text-amber-700 mt-1">
                  Marque "Importar aluno/matrícula" para poder importar as parcelas deste curso.
                </p>
              }
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
          Importar/atualizar selecionados
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
  protected readonly cursoHabilitado = cursoHabilitado;

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
          importarMatricula: !c.matriculaJaExiste,
          cursoEthosId: c.cursoEthosSugerido?.id ?? null,
          editandoAssociacao: !c.cursoEthosSugerido,
          // Decisão do usuário, 2026-09-15: parcelas sempre vêm marcadas
          // para importar/atualizar por padrão.
          parcelas: c.parcelas.map((p) => ({ ...p, selecionada: true })),
        }));
      },
      error: () => (this.buscando = false),
    });
  }

  podeConfirmar(): boolean {
    const cursosComAcao = this.cursosSelecao.filter(
      (c) => (c.matriculaJaExiste || c.importarMatricula) && (c.importarMatricula || c.parcelas.some((p) => p.selecionada)),
    );
    if (cursosComAcao.length === 0) return false;
    // Todo curso com alguma ação precisa de um curso do Ethos escolhido.
    return cursosComAcao.every((c) => !!c.cursoEthosId);
  }

  confirmar(): void {
    if (!this.previa || !this.podeConfirmar()) return;
    this.importando = true;

    const selecoes = this.cursosSelecao
      .filter((c) => c.matriculaJaExiste || c.importarMatricula)
      .map((c) => ({
        alunocursoId: c.alunocursoId,
        cursoEthosId: c.cursoEthosId as string,
        importarMatricula: c.importarMatricula,
        titulosSelecionados: cursoHabilitado(c)
          ? c.parcelas.filter((p) => p.selecionada).map((p) => p.tituloId)
          : [],
      }));

    this.service.confirmar({ cpf: this.previa.cpf, selecoes }).subscribe({
      next: (res) => {
        this.importando = false;
        this.snackBar.open(
          `${res.matriculasNovas} matrícula(s) nova(s), ${res.parcelasNovas} parcela(s) nova(s), ${res.parcelasAtualizadas} atualizada(s).`,
          "Fechar",
          { duration: 6000 },
        );
        this.ref.close(true);
      },
      error: () => (this.importando = false),
    });
  }
}
