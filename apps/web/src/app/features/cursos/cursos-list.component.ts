import { Component, inject, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatChipsModule } from "@angular/material/chips";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { CursosService } from "../../core/services/cursos.service";
import { Curso } from "../../core/models/curso.model";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";

@Component({
  selector: "app-cursos-list",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Cursos</h1>
      <a mat-raised-button color="primary" routerLink="/cursos/novo">
        <mat-icon>add</mat-icon> Novo curso
      </a>
    </div>

    <mat-form-field appearance="outline" class="w-full max-w-md">
      <mat-label>Buscar por nome ou código</mat-label>
      <input matInput [formControl]="busca" />
      <mat-icon matSuffix>search</mat-icon>
    </mat-form-field>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm overflow-x-auto mt-2 w-full">
      <table mat-table [dataSource]="cursos" class="w-full table-compact">
        <ng-container matColumnDef="codigo">
          <th mat-header-cell *matHeaderCellDef>Código</th>
          <td mat-cell *matCellDef="let c">{{ c.codigo }}</td>
        </ng-container>
        <ng-container matColumnDef="nome">
          <th mat-header-cell *matHeaderCellDef>Nome</th>
          <td mat-cell *matCellDef="let c">{{ c.nome }}</td>
        </ng-container>
        <ng-container matColumnDef="situacao">
          <th mat-header-cell *matHeaderCellDef>Situação</th>
          <td mat-cell *matCellDef="let c">
            <span
              class="px-2 py-0.5 rounded text-xs font-medium"
              [class.bg-green-100]="c.situacao"
              [class.text-green-800]="c.situacao"
              [class.bg-gray-200]="!c.situacao"
              [class.text-gray-700]="!c.situacao"
            >
              {{ c.situacao ? "Ativo" : "Inativo" }}
            </span>
          </td>
        </ng-container>
        <ng-container matColumnDef="acoes">
          <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
          <td mat-cell *matCellDef="let c" class="text-right">
            <a mat-icon-button [routerLink]="['/cursos', c.id]" aria-label="Editar">
              <mat-icon>edit</mat-icon>
            </a>
            <button mat-icon-button color="warn" (click)="remover(c)" aria-label="Remover">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="colunas"></tr>
        <tr mat-row *matRowDef="let row; columns: colunas"></tr>
      </table>

      @if (!carregando && cursos.length === 0) {
        <p class="p-6 text-center text-gray-500">Nenhum curso encontrado.</p>
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
export class CursosListComponent implements OnInit {
  private readonly service = inject(CursosService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly busca = new FormControl("", { nonNullable: true });
  colunas = ["codigo", "nome", "situacao", "acoes"];
  cursos: Curso[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;

  ngOnInit(): void {
    this.carregar();
    this.busca.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
      this.page = 1;
      this.carregar();
    });
  }

  carregar(): void {
    this.carregando = true;
    this.service
      .listar({ busca: this.busca.value || undefined, page: this.page, pageSize: this.pageSize })
      .subscribe({
        next: (res) => {
          this.cursos = res.data;
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

  remover(curso: Curso): void {
    const data: ConfirmDialogData = {
      titulo: "Remover curso",
      mensagem: `Deseja remover o curso "${curso.nome}"?`,
      confirmarTexto: "Remover",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "420px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.remover(curso.id).subscribe(() => {
          this.snackBar.open("Curso removido", "Fechar", { duration: 3000 });
          this.carregar();
        });
      });
  }
}
