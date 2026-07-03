import { Component, inject, OnInit } from "@angular/core";
import { CurrencyPipe, DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { RelatoriosService } from "../../core/services/relatorios.service";
import { CursosService } from "../../core/services/cursos.service";
import { CobrancaService } from "../../core/services/cobranca.service";
import {
  FiltrosRelatorio,
  MatriculaElegivel,
  RelatorioInadimplencia,
} from "../../core/models/relatorio.model";
import { Curso } from "../../core/models/curso.model";
import { SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import { RelatorioDetalheDialogComponent } from "./relatorio-detalhe-dialog.component";

@Component({
  selector: "app-relatorios-geracao",
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatProgressBarModule,
    MatDialogModule,
  ],
  template: `
    <h1 class="text-2xl font-medium mb-4">Relatório de inadimplência</h1>

    <div class="bg-white rounded-xl border p-5 mb-5">
      <p class="text-xs font-medium text-gray-600 mb-3">Financeiro</p>
      <form [formGroup]="filtros" class="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
        <mat-form-field appearance="outline">
          <mat-label>Parcelas mínimas vencidas</mat-label>
          <input matInput type="number" min="0" formControlName="parcelasMinimas" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Dias de atraso</mat-label>
          <input matInput type="number" min="0" formControlName="diasAtraso" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Valor mínimo</mat-label>
          <input matInput type="number" min="0" formControlName="valorMinimo" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Curso</mat-label>
          <mat-select formControlName="cursoId">
            <mat-option [value]="undefined">Todos os cursos</mat-option>
            @for (curso of cursos; track curso.id) {
              <mat-option [value]="curso.id">{{ curso.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <p class="text-xs font-medium text-gray-600 col-span-2 md:col-span-4 mb-0 mt-1">
          Cobrança
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Incluir situação</mat-label>
          <mat-select formControlName="situacaoCobrancaId">
            <mat-option [value]="undefined">Todas as situações</mat-option>
            @for (situacao of situacoes; track situacao.id) {
              <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Possui a TAG</mat-label>
          <mat-select formControlName="tagId">
            <mat-option [value]="undefined">Qualquer TAG</mat-option>
            @for (tag of tags; track tag.id) {
              <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <div class="flex items-center">
          <mat-checkbox formControlName="ignorarSituacoesTratadas">
            Excluir situações já tratadas
          </mat-checkbox>
        </div>
      </form>
      <button mat-raised-button color="primary" type="button" (click)="buscarElegiveis()">
        <mat-icon>search</mat-icon> Buscar elegíveis
      </button>
      <p class="text-[11px] text-gray-400 mt-3 mb-0">
        Deixe em branco para usar os padrões configurados no sistema. "Excluir situações já
        tratadas" ignora matrículas cuja situação atual está marcada como
        "não participa de novos relatórios" (ex.: Quitado).
      </p>
    </div>

    @if (carregandoElegiveis) {
      <mat-progress-bar mode="indeterminate" class="mb-3"></mat-progress-bar>
    }

    @if (buscou) {
      @if (elegiveis.length > 0) {
        <div class="flex flex-wrap justify-between items-center gap-2 bg-blue-50 rounded px-4 py-2 mb-3">
          <span class="text-sm text-blue-900 font-medium">
            {{ selecionados.size }} de {{ elegiveis.length }} alunos selecionados
          </span>
          <div class="flex flex-wrap gap-2 items-center">
            <mat-form-field appearance="outline" class="!w-44" subscriptSizing="dynamic">
              <mat-select
                placeholder="Alterar situação"
                (selectionChange)="situacaoLote = $event.value"
              >
                @for (situacao of situacoes; track situacao.id) {
                  <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="!w-40" subscriptSizing="dynamic">
              <mat-select placeholder="Inserir TAG" (selectionChange)="tagLote = $event.value">
                @for (tag of tags; track tag.id) {
                  <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <button
              mat-stroked-button
              [disabled]="selecionados.size === 0 || (!situacaoLote && !tagLote)"
              (click)="aplicarLote()"
            >
              Aplicar
            </button>
            <button
              mat-raised-button
              color="primary"
              [disabled]="selecionados.size === 0 || gerando"
              (click)="gerarRelatorio()"
            >
              <mat-icon>description</mat-icon> Gerar Word em lote
            </button>
          </div>
        </div>

        <div class="bg-white rounded shadow-sm overflow-auto mb-6">
          <table mat-table [dataSource]="elegiveis" class="w-full">
            <ng-container matColumnDef="selecionar">
              <th mat-header-cell *matHeaderCellDef>
                <mat-checkbox
                  [checked]="todosSelecionados()"
                  [indeterminate]="algunsSelecionados()"
                  (change)="alternarTodos($event.checked)"
                ></mat-checkbox>
              </th>
              <td mat-cell *matCellDef="let e">
                <mat-checkbox
                  [checked]="selecionados.has(e.matriculaId)"
                  (change)="alternarSelecao(e.matriculaId)"
                ></mat-checkbox>
              </td>
            </ng-container>
            <ng-container matColumnDef="nome">
              <th mat-header-cell *matHeaderCellDef>Nome</th>
              <td mat-cell *matCellDef="let e">{{ e.alunoNome }}</td>
            </ng-container>
            <ng-container matColumnDef="curso">
              <th mat-header-cell *matHeaderCellDef>Curso</th>
              <td mat-cell *matCellDef="let e">{{ e.cursoNome }}</td>
            </ng-container>
            <ng-container matColumnDef="parcelas">
              <th mat-header-cell *matHeaderCellDef>Parcelas</th>
              <td mat-cell *matCellDef="let e">{{ e.quantidadeParcelasVencidas }}</td>
            </ng-container>
            <ng-container matColumnDef="diasAtraso">
              <th mat-header-cell *matHeaderCellDef>Dias de atraso</th>
              <td mat-cell *matCellDef="let e">{{ e.diasAtrasoMaximo }}</td>
            </ng-container>
            <ng-container matColumnDef="total">
              <th mat-header-cell *matHeaderCellDef>Total devedor</th>
              <td mat-cell *matCellDef="let e">{{ e.valorTotal | currency: "BRL" }}</td>
            </ng-container>
            <ng-container matColumnDef="situacao">
              <th mat-header-cell *matHeaderCellDef>Situação</th>
              <td mat-cell *matCellDef="let e">
                <span class="px-2 py-0.5 rounded text-xs bg-gray-100">{{
                  e.situacaoCobrancaNome || "—"
                }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="acoes">
              <th mat-header-cell *matHeaderCellDef class="text-right">Ficha</th>
              <td mat-cell *matCellDef="let e" class="text-right">
                <a
                  mat-icon-button
                  [routerLink]="['/cobranca/matriculas', e.matriculaId]"
                  aria-label="Ver ficha de cobrança"
                >
                  <mat-icon>receipt_long</mat-icon>
                </a>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="colunasElegiveis"></tr>
            <tr mat-row *matRowDef="let row; columns: colunasElegiveis"></tr>
          </table>
        </div>
      } @else {
        <p class="p-4 text-center text-gray-500 mb-6">
          Nenhum aluno elegível encontrado para os filtros informados.
        </p>
      }
    }

    <div>
      <p class="text-xs font-medium text-gray-600 mb-3">Histórico de relatórios gerados</p>

      @if (carregandoHistorico) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      <div class="bg-white rounded shadow-sm overflow-auto">
        <table mat-table [dataSource]="historico" class="w-full">
          <ng-container matColumnDef="data">
            <th mat-header-cell *matHeaderCellDef>Data</th>
            <td mat-cell *matCellDef="let r">{{ r.data | date: "dd/MM/yyyy HH:mm" }}</td>
          </ng-container>
          <ng-container matColumnDef="curso">
            <th mat-header-cell *matHeaderCellDef>Curso</th>
            <td mat-cell *matCellDef="let r">{{ r.curso?.nome || "Todos" }}</td>
          </ng-container>
          <ng-container matColumnDef="totalElegiveis">
            <th mat-header-cell *matHeaderCellDef>Elegíveis</th>
            <td mat-cell *matCellDef="let r">{{ r.totalElegiveis }}</td>
          </ng-container>
          <ng-container matColumnDef="totalDocumentosGerados">
            <th mat-header-cell *matHeaderCellDef>Documentos gerados</th>
            <td mat-cell *matCellDef="let r">
              {{ r.totalDocumentosGerados }} / {{ r.totalElegiveis }}
            </td>
          </ng-container>
          <ng-container matColumnDef="acoes">
            <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
            <td mat-cell *matCellDef="let r" class="text-right">
              <button mat-icon-button (click)="verDetalhes(r)" aria-label="Ver detalhes">
                <mat-icon>visibility</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="colunasHistorico"></tr>
          <tr mat-row *matRowDef="let row; columns: colunasHistorico"></tr>
        </table>

        @if (!carregandoHistorico && historico.length === 0) {
          <p class="p-6 text-center text-gray-500">Nenhum relatório gerado ainda.</p>
        }
      </div>
    </div>
  `,
})
export class RelatoriosGeracaoComponent implements OnInit {
  private readonly service = inject(RelatoriosService);
  private readonly cursosService = inject(CursosService);
  private readonly cobrancaService = inject(CobrancaService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly filtros = this.fb.nonNullable.group({
    parcelasMinimas: this.fb.control<number | undefined>(undefined),
    diasAtraso: this.fb.control<number | undefined>(undefined),
    valorMinimo: this.fb.control<number | undefined>(undefined),
    cursoId: this.fb.control<string | undefined>(undefined),
    situacaoCobrancaId: this.fb.control<string | undefined>(undefined),
    tagId: this.fb.control<string | undefined>(undefined),
    ignorarSituacoesTratadas: this.fb.nonNullable.control(true),
  });

  cursos: Curso[] = [];
  situacoes: SituacaoCobranca[] = [];
  tags: Tag[] = [];
  elegiveis: MatriculaElegivel[] = [];
  selecionados = new Set<string>();
  situacaoLote?: string;
  tagLote?: string;
  colunasElegiveis = [
    "selecionar",
    "nome",
    "curso",
    "parcelas",
    "diasAtraso",
    "total",
    "situacao",
    "acoes",
  ];
  carregandoElegiveis = false;
  gerando = false;
  buscou = false;

  historico: RelatorioInadimplencia[] = [];
  colunasHistorico = ["data", "curso", "totalElegiveis", "totalDocumentosGerados", "acoes"];
  carregandoHistorico = false;

  ngOnInit(): void {
    this.cursosService.listar({ pageSize: 100 }).subscribe((res) => (this.cursos = res.data));
    this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoes = res));
    this.cobrancaService.listarTags().subscribe((res) => (this.tags = res));
    this.carregarHistorico();
  }

  private valoresFiltro(): FiltrosRelatorio {
    const bruto = this.filtros.getRawValue();
    return {
      parcelasMinimas: bruto.parcelasMinimas ?? undefined,
      diasAtraso: bruto.diasAtraso ?? undefined,
      valorMinimo: bruto.valorMinimo ?? undefined,
      cursoId: bruto.cursoId ?? undefined,
      situacaoCobrancaId: bruto.situacaoCobrancaId ?? undefined,
      tagId: bruto.tagId ?? undefined,
      ignorarSituacoesTratadas: bruto.ignorarSituacoesTratadas,
    };
  }

  buscarElegiveis(): void {
    this.carregandoElegiveis = true;
    this.buscou = true;
    this.selecionados.clear();

    this.service.previaElegiveis(this.valoresFiltro()).subscribe({
      next: (res) => {
        this.elegiveis = res.data;
        this.carregandoElegiveis = false;
      },
      error: () => (this.carregandoElegiveis = false),
    });
  }

  alternarSelecao(matriculaId: string): void {
    if (this.selecionados.has(matriculaId)) this.selecionados.delete(matriculaId);
    else this.selecionados.add(matriculaId);
  }

  alternarTodos(marcar: boolean): void {
    this.selecionados = marcar ? new Set(this.elegiveis.map((e) => e.matriculaId)) : new Set();
  }

  todosSelecionados(): boolean {
    return this.elegiveis.length > 0 && this.selecionados.size === this.elegiveis.length;
  }

  algunsSelecionados(): boolean {
    return this.selecionados.size > 0 && !this.todosSelecionados();
  }

  aplicarLote(): void {
    this.cobrancaService
      .aplicarLote({
        matriculaIds: Array.from(this.selecionados),
        situacaoCobrancaId: this.situacaoLote,
        tagIds: this.tagLote ? [this.tagLote] : undefined,
      })
      .subscribe((resultado) => {
        this.snackBar.open(
          `Aplicado em ${resultado.sucesso} de ${resultado.total} matrículas`,
          "Fechar",
          { duration: 4000 },
        );
        this.buscarElegiveis();
      });
  }

  gerarRelatorio(): void {
    this.gerando = true;
    this.service.gerar(this.valoresFiltro(), Array.from(this.selecionados)).subscribe({
      next: () => {
        this.gerando = false;
        this.snackBar.open(
          "Geração enfileirada. Os documentos aparecerão no histórico quando prontos.",
          "Fechar",
          { duration: 5000 },
        );
        this.selecionados.clear();
        this.carregarHistorico();
      },
      error: () => (this.gerando = false),
    });
  }

  carregarHistorico(): void {
    this.carregandoHistorico = true;
    this.service.listar({ page: 1, pageSize: 10 }).subscribe({
      next: (res) => {
        this.historico = res.data;
        this.carregandoHistorico = false;
      },
      error: () => (this.carregandoHistorico = false),
    });
  }

  verDetalhes(relatorio: RelatorioInadimplencia): void {
    this.service.buscarPorId(relatorio.id).subscribe((completo) => {
      this.dialog.open(RelatorioDetalheDialogComponent, {
        data: { relatorio: completo },
        width: "640px",
      });
    });
  }
}
