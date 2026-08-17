import { Component, inject, OnInit } from "@angular/core";
import { DatePipe, NgClass } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { MatriculasService } from "../../core/services/matriculas.service";
import { Matricula } from "../../core/models/matricula.model";
import { CobrancaService } from "../../core/services/cobranca.service";
import { SituacaoCobranca, Tag } from "../../core/models/cobranca.model";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";

@Component({
  selector: "app-matriculas-list",
  standalone: true,
  imports: [
    DatePipe,
    NgClass,
    RouterLink,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatDialogModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Matrículas</h1>
      <a mat-raised-button color="primary" routerLink="/matriculas/novo">
        <mat-icon>add</mat-icon> Nova matrícula
      </a>
    </div>

    <form
      [formGroup]="filtros"
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 items-start mb-3"
    >
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Nome do aluno</mat-label>
        <input matInput formControlName="alunoNome" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>CPF</mat-label>
        <input matInput formControlName="alunoCpf" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Situação</mat-label>
        <input matInput formControlName="situacao" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Situação de cobrança</mat-label>
        <mat-select formControlName="situacaoCobrancaId">
          <mat-option [value]="undefined">Todas</mat-option>
          @for (situacao of situacoesCobranca; track situacao.id) {
            <mat-option [value]="situacao.id">{{ situacao.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>TAG</mat-label>
        <mat-select formControlName="tagId">
          <mat-option [value]="undefined">Todas</mat-option>
          @for (tag of tags; track tag.id) {
            <mat-option [value]="tag.id">{{ tag.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Contrato assinado</mat-label>
        <mat-select formControlName="contratoAssinado">
          <mat-option [value]="undefined">Todos</mat-option>
          <mat-option [value]="true">Sim</mat-option>
          <mat-option [value]="false">Não</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>TCD assinado</mat-label>
        <mat-select formControlName="tcdAssinado">
          <mat-option [value]="undefined">Todos</mat-option>
          <mat-option [value]="true">Sim</mat-option>
          <mat-option [value]="false">Não</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Matrícula de</mat-label>
        <input matInput type="date" formControlName="dataMatriculaInicio" />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Matrícula até</mat-label>
        <input matInput type="date" formControlName="dataMatriculaFim" />
      </mat-form-field>
    </form>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm overflow-x-auto mt-2 w-full">
      <table mat-table [dataSource]="matriculas" class="w-full table-compact">
        <ng-container matColumnDef="aluno">
          <th mat-header-cell *matHeaderCellDef>Aluno</th>
          <td mat-cell *matCellDef="let m">{{ m.aluno?.nome || m.alunoId }}</td>
        </ng-container>
        <ng-container matColumnDef="curso">
          <th mat-header-cell *matHeaderCellDef>Curso</th>
          <td mat-cell *matCellDef="let m">{{ m.curso?.nome || m.cursoId }}</td>
        </ng-container>
        <ng-container matColumnDef="numero">
          <th mat-header-cell *matHeaderCellDef>Matrícula</th>
          <td mat-cell *matCellDef="let m">{{ m.numeroMatricula || "—" }}</td>
        </ng-container>
        <ng-container matColumnDef="data">
          <th mat-header-cell *matHeaderCellDef>Data</th>
          <td mat-cell *matCellDef="let m">
            {{ m.dataMatricula ? (m.dataMatricula | date: "dd/MM/yyyy") : "—" }}
          </td>
        </ng-container>
        <ng-container matColumnDef="situacao">
          <th mat-header-cell *matHeaderCellDef>Situação</th>
          <td mat-cell *matCellDef="let m">
            <span class="px-2 py-0.5 rounded text-xs bg-gray-100 whitespace-nowrap">{{
              m.situacao
            }}</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="parcelas">
          <th mat-header-cell *matHeaderCellDef>Parcelas</th>
          <td mat-cell *matCellDef="let m" class="whitespace-nowrap">
            <div class="flex gap-1 flex-wrap">
              @for (badge of badgesParcelas(m); track badge.label) {
                <span class="px-2 py-0.5 rounded text-xs" [ngClass]="badge.classe">{{
                  badge.label
                }}</span>
              }
              @if (badgesParcelas(m).length === 0) {
                <span class="text-gray-400 text-xs">—</span>
              }
            </div>
          </td>
        </ng-container>
        <ng-container matColumnDef="acoes">
          <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
          <td mat-cell *matCellDef="let m" class="text-right whitespace-nowrap">
            <a
              mat-icon-button
              [routerLink]="['/cobranca/matriculas', m.id]"
              aria-label="Ficha de cobrança"
            >
              <mat-icon>receipt_long</mat-icon>
            </a>
            <a mat-icon-button [routerLink]="['/matriculas', m.id]" aria-label="Editar">
              <mat-icon>edit</mat-icon>
            </a>
            <button mat-icon-button color="warn" (click)="remover(m)" aria-label="Remover">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="colunas"></tr>
        <tr mat-row *matRowDef="let row; columns: colunas"></tr>
      </table>

      @if (!carregando && matriculas.length === 0) {
        <p class="p-6 text-center text-gray-500">Nenhuma matrícula encontrada.</p>
      }

      <mat-paginator
        [length]="total"
        [pageSize]="pageSize"
        [pageIndex]="page - 1"
        [pageSizeOptions]="[20, 50, 100]"
        (page)="mudarPagina($event)"
      ></mat-paginator>
    </div>
  `,
})
export class MatriculasListComponent implements OnInit {
  private readonly service = inject(MatriculasService);
  private readonly cobrancaService = inject(CobrancaService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly filtros = this.fb.nonNullable.group({
    alunoNome: this.fb.control<string | undefined>(undefined),
    alunoCpf: this.fb.control<string | undefined>(undefined),
    situacao: this.fb.control<string | undefined>(undefined),
    situacaoCobrancaId: this.fb.control<string | undefined>(undefined),
    tagId: this.fb.control<string | undefined>(undefined),
    contratoAssinado: this.fb.control<boolean | undefined>(undefined),
    tcdAssinado: this.fb.control<boolean | undefined>(undefined),
    dataMatriculaInicio: this.fb.control<string | undefined>(undefined),
    dataMatriculaFim: this.fb.control<string | undefined>(undefined),
  });

  colunas = ["aluno", "curso", "numero", "data", "situacao", "parcelas", "acoes"];
  matriculas: Matricula[] = [];
  situacoesCobranca: SituacaoCobranca[] = [];
  tags: Tag[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;

  ngOnInit(): void {
    this.cobrancaService.listarSituacoes(true).subscribe((res) => (this.situacoesCobranca = res));
    this.cobrancaService.listarTags().subscribe((res) => (this.tags = res));
    this.carregar();
    this.filtros.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
      this.page = 1;
      this.carregar();
    });
  }

  carregar(): void {
    this.carregando = true;
    const valores = this.filtros.getRawValue();
    this.service
      .listar({
        alunoNome: valores.alunoNome || undefined,
        alunoCpf: valores.alunoCpf || undefined,
        situacao: valores.situacao || undefined,
        situacaoCobrancaId: valores.situacaoCobrancaId || undefined,
        tagId: valores.tagId || undefined,
        contratoAssinado: valores.contratoAssinado ?? undefined,
        tcdAssinado: valores.tcdAssinado ?? undefined,
        dataMatriculaInicio: valores.dataMatriculaInicio || undefined,
        dataMatriculaFim: valores.dataMatriculaFim || undefined,
        page: this.page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.matriculas = res.data;
          this.total = res.total;
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });
  }

  /** Contagem de parcelas por situação, para os badges do grid (item 4 do PENDENCIAS.md). */
  badgesParcelas(m: Matricula): Array<{ label: string; classe: string }> {
    const r = m.resumoParcelas;
    if (!r) return [];

    const badges: Array<{ label: string; classe: string }> = [];
    if (r.vencidas > 0) {
      badges.push({
        label: `${r.vencidas} vencida${r.vencidas > 1 ? "s" : ""}`,
        classe: "bg-orange-100 text-orange-700",
      });
    }
    if (r.protestadas > 0) {
      badges.push({
        label: `${r.protestadas} protestada${r.protestadas > 1 ? "s" : ""}`,
        classe: "bg-red-100 text-red-800",
      });
    }
    if (r.emAberto > 0) {
      badges.push({
        label: `${r.emAberto} aberta${r.emAberto > 1 ? "s" : ""}`,
        classe: "bg-blue-100 text-blue-700",
      });
    }
    if (r.renegociadas > 0) {
      badges.push({
        label: `${r.renegociadas} renegociada${r.renegociadas > 1 ? "s" : ""}`,
        classe: "bg-purple-100 text-purple-700",
      });
    }
    if (r.pagas > 0) {
      badges.push({
        label: `${r.pagas} paga${r.pagas > 1 ? "s" : ""}`,
        classe: "bg-green-100 text-green-700",
      });
    }
    if (r.canceladas > 0) {
      badges.push({
        label: `${r.canceladas} cancelada${r.canceladas > 1 ? "s" : ""}`,
        classe: "bg-gray-100 text-gray-500",
      });
    }
    return badges;
  }

  mudarPagina(evento: PageEvent): void {
    this.page = evento.pageIndex + 1;
    this.pageSize = evento.pageSize;
    this.carregar();
  }

  remover(matricula: Matricula): void {
    const data: ConfirmDialogData = {
      titulo: "Remover matrícula",
      mensagem: `Deseja remover a matrícula de "${matricula.aluno?.nome ?? "aluno"}"?`,
      confirmarTexto: "Remover",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "420px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.remover(matricula.id).subscribe(() => {
          this.snackBar.open("Matrícula removida", "Fechar", { duration: 3000 });
          this.carregar();
        });
      });
  }
}
