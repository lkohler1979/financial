import { Component, inject, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatriculasService } from "../../core/services/matriculas.service";
import { Matricula } from "../../core/models/matricula.model";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";

@Component({
  selector: "app-matriculas-list",
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Matrículas</h1>
      <a mat-raised-button color="primary" routerLink="/matriculas/novo">
        <mat-icon>add</mat-icon> Nova matrícula
      </a>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm overflow-auto mt-2">
      <table mat-table [dataSource]="matriculas" class="w-full">
        <ng-container matColumnDef="aluno">
          <th mat-header-cell *matHeaderCellDef>Aluno</th>
          <td mat-cell *matCellDef="let m">{{ m.aluno?.nome || m.alunoId }}</td>
        </ng-container>
        <ng-container matColumnDef="curso">
          <th mat-header-cell *matHeaderCellDef>Curso</th>
          <td mat-cell *matCellDef="let m">{{ m.curso?.nome || m.cursoId }}</td>
        </ng-container>
        <ng-container matColumnDef="numero">
          <th mat-header-cell *matHeaderCellDef>Nº matrícula</th>
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
          <td mat-cell *matCellDef="let m">{{ m.situacao }}</td>
        </ng-container>
        <ng-container matColumnDef="acoes">
          <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
          <td mat-cell *matCellDef="let m" class="text-right">
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
        [pageSizeOptions]="[10, 20, 50]"
        (page)="mudarPagina($event)"
      ></mat-paginator>
    </div>
  `,
})
export class MatriculasListComponent implements OnInit {
  private readonly service = inject(MatriculasService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  colunas = ["aluno", "curso", "numero", "data", "situacao", "acoes"];
  matriculas: Matricula[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.service.listar({ page: this.page, pageSize: this.pageSize }).subscribe({
      next: (res) => {
        this.matriculas = res.data;
        this.total = res.total;
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });
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
