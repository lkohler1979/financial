import { Component, inject, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { AlunosService } from "../../core/services/alunos.service";
import { Aluno } from "../../core/models/aluno.model";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../shared/components/confirm-dialog.component";
import { formatarCpf } from "../../shared/utils/cpf.util";

@Component({
  selector: "app-alunos-list",
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Alunos</h1>
      <a mat-raised-button color="primary" routerLink="/alunos/novo">
        <mat-icon>add</mat-icon> Novo aluno
      </a>
    </div>

    <mat-form-field appearance="outline" class="w-full max-w-md">
      <mat-label>Buscar por nome, CPF ou e-mail</mat-label>
      <input matInput [formControl]="busca" placeholder="Digite para filtrar" />
      <mat-icon matSuffix>search</mat-icon>
    </mat-form-field>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm overflow-x-auto mt-2 w-full">
      <table mat-table [dataSource]="alunos" class="w-full table-compact">
        <ng-container matColumnDef="nome">
          <th mat-header-cell *matHeaderCellDef>Nome</th>
          <td mat-cell *matCellDef="let a">{{ a.nome }}</td>
        </ng-container>
        <ng-container matColumnDef="cpf">
          <th mat-header-cell *matHeaderCellDef>CPF</th>
          <td mat-cell *matCellDef="let a">{{ formatarCpf(a.cpf) }}</td>
        </ng-container>
        <ng-container matColumnDef="email">
          <th mat-header-cell *matHeaderCellDef>E-mail</th>
          <td mat-cell *matCellDef="let a">{{ a.email || "—" }}</td>
        </ng-container>
        <ng-container matColumnDef="cidade">
          <th mat-header-cell *matHeaderCellDef>Cidade/UF</th>
          <td mat-cell *matCellDef="let a">
            {{ a.cidade || "—" }}{{ a.estado ? "/" + a.estado : "" }}
          </td>
        </ng-container>
        <ng-container matColumnDef="acoes">
          <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
          <td mat-cell *matCellDef="let a" class="text-right">
            <a mat-icon-button [routerLink]="['/alunos', a.id]" aria-label="Editar">
              <mat-icon>edit</mat-icon>
            </a>
            <button mat-icon-button color="warn" (click)="remover(a)" aria-label="Remover">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="colunas"></tr>
        <tr mat-row *matRowDef="let row; columns: colunas"></tr>
      </table>

      @if (!carregando && alunos.length === 0) {
        <p class="p-6 text-center text-gray-500">Nenhum aluno encontrado.</p>
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
export class AlunosListComponent implements OnInit {
  private readonly service = inject(AlunosService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly formatarCpf = formatarCpf;

  readonly busca = new FormControl("", { nonNullable: true });
  colunas = ["nome", "cpf", "email", "cidade", "acoes"];
  alunos: Aluno[] = [];
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
          this.alunos = res.data;
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

  remover(aluno: Aluno): void {
    const data: ConfirmDialogData = {
      titulo: "Remover aluno",
      mensagem: `Deseja remover o aluno "${aluno.nome}"? Esta ação não pode ser desfeita.`,
      confirmarTexto: "Remover",
    };
    this.dialog
      .open(ConfirmDialogComponent, { data, width: "420px" })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) return;
        this.service.remover(aluno.id).subscribe(() => {
          this.snackBar.open("Aluno removido", "Fechar", { duration: 3000 });
          this.carregar();
        });
      });
  }
}
