import { Component, inject, OnDestroy, OnInit } from "@angular/core";
import { DatePipe } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatTableModule } from "@angular/material/table";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subscription, interval, switchMap, takeWhile } from "rxjs";
import { ImportacaoService } from "../../core/services/importacao.service";
import { Importacao, StatusJobImportacao } from "../../core/models/importacao.model";
import { ImportacaoLogDialogComponent } from "./importacao-log-dialog.component";

@Component({
  selector: "app-importacao-upload",
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    MatDialogModule,
  ],
  template: `
    <h1 class="text-2xl font-medium mb-4">Importação</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
      <div
        class="bg-white border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2 cursor-pointer transition-colors"
        [class.border-blue-400]="arrastando"
        [class.bg-blue-50]="arrastando"
        [class.border-gray-300]="!arrastando"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave()"
        (drop)="onDrop($event)"
        (click)="inputArquivo.click()"
      >
        <mat-icon class="!w-8 !h-8 !text-3xl text-gray-500">upload_file</mat-icon>
        <p class="text-sm font-medium m-0">Arraste a planilha .xlsx aqui</p>
        <p class="text-xs text-gray-500 m-0">ou clique para selecionar o arquivo</p>
        <button mat-stroked-button type="button" class="mt-1" [disabled]="enviando">
          Selecionar arquivo
        </button>
        <input
          #inputArquivo
          type="file"
          accept=".xlsx,.xls"
          class="hidden"
          (change)="onSelecionarArquivo($event)"
        />
      </div>

      <div class="bg-white rounded-xl border p-5">
        <p class="text-xs font-medium text-gray-600 mb-3">Frequência configurada</p>
        <div class="flex gap-2 mb-4">
          <span class="text-xs px-2.5 py-1 rounded bg-gray-100">Manual</span>
          <span class="text-xs px-2.5 py-1 rounded bg-gray-100">Semanal</span>
          <span class="text-xs px-2.5 py-1 rounded bg-gray-100">Mensal</span>
        </div>
        <p class="text-xs font-medium text-gray-600 mb-1">Curso não mapeado</p>
        <p class="text-xs text-gray-500 m-0">
          Cria o curso automaticamente ao encontrar um nome novo na planilha.
        </p>
        <p class="text-[11px] text-gray-400 mt-3 mb-0">
          Frequência, documentos e regras de elegibilidade são ajustados em Configurações.
        </p>
      </div>
    </div>

    @if (enviando && jobAtual) {
      <div class="bg-white rounded-xl border p-5 mb-5">
        <div class="flex justify-between items-center mb-2">
          <p class="text-sm font-medium m-0">{{ nomeArquivoAtual }}</p>
          <span class="text-xs text-gray-500">{{ jobAtual.estado }}</span>
        </div>
        <mat-progress-bar mode="determinate" [value]="jobAtual.progresso"></mat-progress-bar>
        <p class="text-xs text-gray-500 mt-2 mb-0">
          Processando em segundo plano · {{ jobAtual.progresso }}%
        </p>
      </div>
    }

    <div>
      <p class="text-xs font-medium text-gray-600 mb-3">Histórico de importações</p>

      @if (carregandoHistorico) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      <div class="bg-white rounded shadow-sm overflow-x-auto w-full">
        <table mat-table [dataSource]="historico" class="w-full table-compact">
          <ng-container matColumnDef="arquivo">
            <th mat-header-cell *matHeaderCellDef>Arquivo</th>
            <td mat-cell *matCellDef="let i">{{ i.arquivo }}</td>
          </ng-container>
          <ng-container matColumnDef="data">
            <th mat-header-cell *matHeaderCellDef>Data</th>
            <td mat-cell *matCellDef="let i">{{ i.data | date: "dd/MM/yyyy HH:mm" }}</td>
          </ng-container>
          <ng-container matColumnDef="totalRegistros">
            <th mat-header-cell *matHeaderCellDef>Registros</th>
            <td mat-cell *matCellDef="let i">{{ i.totalRegistros }}</td>
          </ng-container>
          <ng-container matColumnDef="novosAlunos">
            <th mat-header-cell *matHeaderCellDef>Novos alunos</th>
            <td mat-cell *matCellDef="let i">{{ i.novosAlunos }}</td>
          </ng-container>
          <ng-container matColumnDef="alunosAtualizados">
            <th mat-header-cell *matHeaderCellDef>Atualizados</th>
            <td mat-cell *matCellDef="let i">{{ i.alunosAtualizados }}</td>
          </ng-container>
          <ng-container matColumnDef="parcelasNovas">
            <th mat-header-cell *matHeaderCellDef>Parcelas novas</th>
            <td mat-cell *matCellDef="let i">{{ i.parcelasNovas }}</td>
          </ng-container>
          <ng-container matColumnDef="erros">
            <th mat-header-cell *matHeaderCellDef>Erros</th>
            <td mat-cell *matCellDef="let i">
              @if ((i.erros?.length ?? 0) > 0) {
                <button
                  mat-button
                  color="warn"
                  class="!min-w-0 !px-2"
                  (click)="verLog(i)"
                  [attr.aria-label]="'Ver log de erros de ' + i.arquivo"
                >
                  <mat-icon class="!text-base align-middle">error_outline</mat-icon>
                  {{ i.erros?.length }}
                </button>
              } @else {
                <span class="text-gray-400">0</span>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="colunasHistorico"></tr>
          <tr mat-row *matRowDef="let row; columns: colunasHistorico"></tr>
        </table>

        @if (!carregandoHistorico && historico.length === 0) {
          <p class="p-6 text-center text-gray-500">Nenhuma importação realizada ainda.</p>
        }
      </div>
    </div>
  `,
})
export class ImportacaoUploadComponent implements OnInit, OnDestroy {
  private readonly service = inject(ImportacaoService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private pollingSub?: Subscription;

  arrastando = false;
  enviando = false;
  jobAtual?: StatusJobImportacao;
  nomeArquivoAtual = "";

  historico: Importacao[] = [];
  colunasHistorico = [
    "arquivo",
    "data",
    "totalRegistros",
    "novosAlunos",
    "alunosAtualizados",
    "parcelasNovas",
    "erros",
  ];
  carregandoHistorico = false;

  ngOnInit(): void {
    this.carregarHistorico();
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
  }

  onDragOver(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastando = true;
  }

  onDragLeave(): void {
    this.arrastando = false;
  }

  onDrop(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastando = false;
    const arquivo = evento.dataTransfer?.files?.[0];
    if (arquivo) this.enviarArquivo(arquivo);
  }

  onSelecionarArquivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (arquivo) this.enviarArquivo(arquivo);
    input.value = "";
  }

  verLog(importacao: Importacao): void {
    this.dialog.open(ImportacaoLogDialogComponent, {
      data: { importacao },
      width: "560px",
    });
  }

  carregarHistorico(): void {
    this.carregandoHistorico = true;
    this.service.listar({ page: 1, pageSize: 5 }).subscribe({
      next: (res) => {
        this.historico = res.data;
        this.carregandoHistorico = false;
      },
      error: () => (this.carregandoHistorico = false),
    });
  }

  private enviarArquivo(arquivo: File): void {
    this.enviando = true;
    this.jobAtual = undefined;
    this.nomeArquivoAtual = arquivo.name;

    this.service.upload(arquivo).subscribe({
      next: ({ jobId }) => this.acompanharJob(jobId),
      error: () => (this.enviando = false),
    });
  }

  private acompanharJob(jobId: string): void {
    this.pollingSub?.unsubscribe();
    this.pollingSub = interval(1500)
      .pipe(
        switchMap(() => this.service.statusJob(jobId)),
        takeWhile((status) => status.estado !== "completed" && status.estado !== "failed", true),
      )
      .subscribe({
        next: (status) => {
          this.jobAtual = status;

          if (status.estado === "completed") {
            this.enviando = false;
            this.snackBar.open("Importação concluída", "Fechar", { duration: 4000 });
            this.carregarHistorico();
          }

          if (status.estado === "failed") {
            this.enviando = false;
            this.snackBar.open(
              `Falha na importação: ${status.erro ?? "erro desconhecido"}`,
              "Fechar",
              { duration: 6000 },
            );
          }
        },
        error: () => (this.enviando = false),
      });
  }
}
