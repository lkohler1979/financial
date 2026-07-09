import { Component, inject, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatTableModule } from "@angular/material/table";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { UsuariosService } from "../../core/services/usuarios.service";
import { Usuario } from "../../core/models/usuario.model";

const ROTULO_PERFIL: Record<Usuario["perfil"], string> = {
  ADMINISTRADOR: "Administrador",
  FINANCEIRO: "Financeiro",
  USUARIO: "Usuário",
};

@Component({
  selector: "app-usuarios-list",
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
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Usuários</h1>
      <a mat-raised-button color="primary" routerLink="/usuarios/novo">
        <mat-icon>add</mat-icon> Novo usuário
      </a>
    </div>

    <mat-form-field appearance="outline" class="w-full max-w-md">
      <mat-label>Buscar por nome ou e-mail</mat-label>
      <input matInput [formControl]="busca" />
      <mat-icon matSuffix>search</mat-icon>
    </mat-form-field>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm overflow-x-auto mt-2 w-full">
      <table mat-table [dataSource]="usuarios" class="w-full table-compact">
        <ng-container matColumnDef="nome">
          <th mat-header-cell *matHeaderCellDef>Nome</th>
          <td mat-cell *matCellDef="let u">{{ u.nome }}</td>
        </ng-container>
        <ng-container matColumnDef="email">
          <th mat-header-cell *matHeaderCellDef>E-mail</th>
          <td mat-cell *matCellDef="let u">{{ u.email }}</td>
        </ng-container>
        <ng-container matColumnDef="perfil">
          <th mat-header-cell *matHeaderCellDef>Perfil</th>
          <td mat-cell *matCellDef="let u">{{ rotuloPerfil(u.perfil) }}</td>
        </ng-container>
        <ng-container matColumnDef="ativo">
          <th mat-header-cell *matHeaderCellDef>Situação</th>
          <td mat-cell *matCellDef="let u">
            <span
              class="px-2 py-0.5 rounded text-xs font-medium"
              [class.bg-green-100]="u.ativo"
              [class.text-green-800]="u.ativo"
              [class.bg-gray-200]="!u.ativo"
              [class.text-gray-700]="!u.ativo"
            >
              {{ u.ativo ? "Ativo" : "Inativo" }}
            </span>
          </td>
        </ng-container>
        <ng-container matColumnDef="acoes">
          <th mat-header-cell *matHeaderCellDef class="text-right">Ações</th>
          <td mat-cell *matCellDef="let u" class="text-right">
            <a mat-icon-button [routerLink]="['/usuarios', u.id]" aria-label="Editar">
              <mat-icon>edit</mat-icon>
            </a>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="colunas"></tr>
        <tr mat-row *matRowDef="let row; columns: colunas"></tr>
      </table>

      @if (!carregando && usuarios.length === 0) {
        <p class="p-6 text-center text-gray-500">Nenhum usuário encontrado.</p>
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
export class UsuariosListComponent implements OnInit {
  private readonly service = inject(UsuariosService);

  readonly busca = new FormControl("", { nonNullable: true });
  colunas = ["nome", "email", "perfil", "ativo", "acoes"];
  usuarios: Usuario[] = [];
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
          this.usuarios = res.data;
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

  rotuloPerfil(perfil: Usuario["perfil"]): string {
    return ROTULO_PERFIL[perfil];
  }
}
