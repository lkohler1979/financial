import { DatePipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { MatTableModule } from "@angular/material/table";
import { Auditoria, FiltrosAuditoria } from "../../core/models/auditoria.model";
import { AuditoriaService } from "../../core/services/auditoria.service";

@Component({
  selector: "app-auditoria-list",
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Auditoria</h1>
      <button mat-stroked-button type="button" (click)="limparFiltros()">
        <mat-icon>filter_alt_off</mat-icon> Limpar
      </button>
    </div>

    <section class="bg-white rounded-lg border p-4 mb-4">
      <form [formGroup]="filtros" class="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
        <mat-form-field appearance="outline">
          <mat-label>Entidade</mat-label>
          <mat-select formControlName="entidade">
            <mat-option [value]="undefined">Todas</mat-option>
            @for (entidade of entidades; track entidade) {
              <mat-option [value]="entidade">{{ entidade }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Usuário</mat-label>
          <input matInput formControlName="usuario" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Ação</mat-label>
          <mat-select formControlName="acao">
            <mat-option [value]="undefined">Todas</mat-option>
            <mat-option value="CRIACAO">Criação</mat-option>
            <mat-option value="ATUALIZACAO">Atualização</mat-option>
            <mat-option value="EXCLUSAO">Exclusão</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Data inicial</mat-label>
          <input matInput type="date" formControlName="dataInicio" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Data final</mat-label>
          <input matInput type="date" formControlName="dataFim" />
        </mat-form-field>
      </form>

      <button mat-raised-button color="primary" type="button" (click)="buscar()">
        <mat-icon>search</mat-icon> Buscar
      </button>
    </section>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded shadow-sm overflow-x-auto w-full">
      <table mat-table [dataSource]="registros" class="w-full table-compact">
        <ng-container matColumnDef="data">
          <th mat-header-cell *matHeaderCellDef>Data</th>
          <td mat-cell *matCellDef="let r">{{ r.data | date: "dd/MM/yyyy HH:mm:ss" }}</td>
        </ng-container>

        <ng-container matColumnDef="usuario">
          <th mat-header-cell *matHeaderCellDef>Usuário</th>
          <td mat-cell *matCellDef="let r">
            <div>{{ r.usuario?.nome || r.usuarioId }}</div>
            @if (r.usuario?.email) {
              <div class="text-xs text-gray-500">{{ r.usuario?.email }}</div>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="entidade">
          <th mat-header-cell *matHeaderCellDef>Entidade</th>
          <td mat-cell *matCellDef="let r">
            <div class="font-medium">{{ r.entidade }}</div>
            <div class="text-xs text-gray-500">{{ r.entidadeId }}</div>
          </td>
        </ng-container>

        <ng-container matColumnDef="acao">
          <th mat-header-cell *matHeaderCellDef>Ação</th>
          <td mat-cell *matCellDef="let r">
            <span class="px-2 py-0.5 rounded text-xs" [class]="classeAcao(r.acao)">
              {{ labelAcao(r.acao) }}
            </span>
          </td>
        </ng-container>

        <ng-container matColumnDef="detalhes">
          <th mat-header-cell *matHeaderCellDef>Detalhes</th>
          <td mat-cell *matCellDef="let r">
            <code class="text-xs text-gray-600 whitespace-pre-wrap">{{ detalhes(r) }}</code>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="colunas"></tr>
        <tr mat-row *matRowDef="let row; columns: colunas"></tr>
      </table>

      @if (!carregando && registros.length === 0) {
        <p class="p-6 text-center text-gray-500">Nenhum registro de auditoria encontrado.</p>
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
export class AuditoriaListComponent implements OnInit {
  private readonly service = inject(AuditoriaService);
  private readonly fb = inject(FormBuilder);

  readonly filtros = this.fb.group({
    entidade: this.fb.control<string | undefined>(undefined),
    usuario: this.fb.control<string | undefined>(undefined),
    acao: this.fb.control<"CRIACAO" | "ATUALIZACAO" | "EXCLUSAO" | undefined>(undefined),
    dataInicio: this.fb.control<string | undefined>(undefined),
    dataFim: this.fb.control<string | undefined>(undefined),
  });

  entidades: string[] = [];
  registros: Auditoria[] = [];
  colunas = ["data", "usuario", "entidade", "acao", "detalhes"];
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;

  ngOnInit(): void {
    this.service.listarEntidades().subscribe((entidades) => (this.entidades = entidades));
    this.carregar();
  }

  buscar(): void {
    this.page = 1;
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.service.listar(this.filtrosAtuais()).subscribe({
      next: (resultado) => {
        this.registros = resultado.data;
        this.total = resultado.total;
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

  limparFiltros(): void {
    this.filtros.reset({
      entidade: undefined,
      usuario: undefined,
      acao: undefined,
      dataInicio: undefined,
      dataFim: undefined,
    });
    this.buscar();
  }

  filtrosAtuais(): FiltrosAuditoria {
    const bruto = this.filtros.getRawValue();
    return {
      entidade: bruto.entidade || undefined,
      usuario: bruto.usuario || undefined,
      acao: bruto.acao || undefined,
      dataInicio: bruto.dataInicio || undefined,
      dataFim: bruto.dataFim || undefined,
      page: this.page,
      pageSize: this.pageSize,
    };
  }

  labelAcao(acao: Auditoria["acao"]): string {
    const labels = {
      CRIACAO: "Criação",
      ATUALIZACAO: "Atualização",
      EXCLUSAO: "Exclusão",
    };
    return labels[acao];
  }

  classeAcao(acao: Auditoria["acao"]): string {
    if (acao === "CRIACAO") return "bg-emerald-50 text-emerald-700";
    if (acao === "EXCLUSAO") return "bg-red-50 text-red-700";
    return "bg-blue-50 text-blue-700";
  }

  detalhes(registro: Auditoria): string {
    if (!registro.detalhes) return "—";
    const texto = JSON.stringify(registro.detalhes);
    return texto.length > 180 ? `${texto.slice(0, 180)}...` : texto;
  }
}
