import { DatePipe, DecimalPipe } from "@angular/common";
import { Component, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import {
  FiltrosMatriculasLote,
  ImportacaoLegadoService,
  LoteDocumentos,
} from "../../core/services/importacao-legado.service";
import { salvarBlobComoArquivo } from "../../shared/utils/download.util";

const INTERVALO_MS = 3000;

export interface DadosDocumentosLegadoLote {
  /** Matrículas marcadas na lista; sem isso vale o filtro atual. */
  matriculaIds?: string[];
  filtros?: FiltrosMatriculasLote;
  /** Quantas matrículas entram na busca (para o texto de confirmação). */
  quantidade: number;
  /** "marcadas" ou "do filtro atual". */
  origem: string;
}

/**
 * Busca em lote dos documentos no sistema legado para várias matrículas: confirma, dispara o job
 * (segundo plano, no worker) e acompanha o andamento. A tela pode ser fechada e reaberta sem
 * interromper a busca; ao terminar dá para baixar o relatório com o resultado de cada aluno.
 */
@Component({
  selector: "app-documentos-legado-lote-dialog",
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatDialogModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Buscar documentos no legado (em lote)</h2>
    <mat-dialog-content>
      <p class="text-sm text-gray-600 mt-0">
        Para cada aluno das matrículas {{ dados.origem }} (<strong>{{ dados.quantidade }}</strong>
        matrícula{{ dados.quantidade === 1 ? "" : "s" }}), consulta o sistema legado e
        <strong>baixa os documentos para o Ethos</strong> (CPF, RG, comprovante…), com a situação de
        deferimento do legado. Arquivo que já foi importado não é baixado de novo e um arquivo que
        já existe no Ethos nunca é substituído. Ao final, a situação da documentação de cada
        matrícula é atualizada. Continua em segundo plano.
      </p>

      @if (lote(); as l) {
        <div class="border rounded-lg p-4 bg-gray-50 mb-3">
          <p class="m-0 text-sm font-medium">
            @switch (l.status) {
              @case ("EM_ANDAMENTO") {
                Buscando os documentos…
              }
              @case ("CONCLUIDO") {
                Concluída em {{ l.finalizadoEm | date: "dd/MM/yyyy HH:mm" }}
              }
              @case ("CANCELADO") {
                Cancelada em {{ l.finalizadoEm | date: "dd/MM/yyyy HH:mm" }}
              }
              @case ("FALHOU") {
                A busca foi interrompida
              }
            }
          </p>

          <p class="text-xs text-gray-500 m-0">
            Última busca em lote, iniciada em {{ l.criadoEm | date: "dd/MM/yyyy HH:mm" }}
          </p>
          <mat-progress-bar
            mode="determinate"
            [value]="percentual(l)"
            class="my-2"
          ></mat-progress-bar>
          <p class="text-xs text-gray-600 m-0">
            {{ l.processados | number }} de {{ l.total | number }} alunos ({{ percentual(l) }}%)
          </p>
          @if (l.mensagemFalha) {
            <p class="text-sm text-red-600 mt-2 mb-0">{{ l.mensagemFalha }}</p>
          }

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-sm">
            <div>
              <span class="block text-xs text-gray-500">Documentos baixados</span
              >{{ l.baixados | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Já importados antes</span
              >{{ l.jaImportados | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Mantidos (outro arquivo no Ethos)</span
              >{{ l.mantidos | number }}
            </div>
            <div>
              <span class="block text-xs text-gray-500">Tipos sem documento no legado</span
              >{{ l.semDocumento | number }}
            </div>
            <div [class]="l.errosDocumentos ? 'text-red-600' : ''">
              <span class="block text-xs text-gray-500">Erros em documentos</span
              >{{ l.errosDocumentos | number }}
            </div>
            <div [class]="l.alunosComErro ? 'text-red-600' : ''">
              <span class="block text-xs text-gray-500">Alunos com erro</span
              >{{ l.alunosComErro | number }}
            </div>
          </div>
        </div>

        @if (l.problemas.length) {
          <p class="text-sm font-medium mb-1">Alunos que precisam de atenção</p>
          <ul class="text-sm mt-0 pl-5 max-h-40 overflow-auto">
            @for (p of l.problemas; track p.id) {
              <li class="text-amber-800">
                {{ p.alunoNome }}<span class="text-gray-600"> — {{ p.mensagem || "erro" }}</span>
              </li>
            }
          </ul>
          @if (l.alunosComErro + l.errosDocumentos > l.problemas.length) {
            <p class="text-xs text-gray-500 mt-0">
              Mostrando os primeiros; o relatório (Excel) traz todos.
            </p>
          }
        }
      } @else if (carregado()) {
        <p class="text-sm text-gray-500">Nenhuma busca de documentos em lote foi feita ainda.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="!flex-wrap gap-1">
      <button mat-button mat-dialog-close>Fechar</button>
      @if (lote(); as l) {
        <button
          mat-stroked-button
          type="button"
          [disabled]="baixando()"
          (click)="baixarRelatorio(l.id)"
        >
          Baixar relatório (Excel)
        </button>
        @if (l.status === "EM_ANDAMENTO") {
          <button mat-stroked-button color="warn" type="button" (click)="cancelar(l.id)">
            Cancelar busca
          </button>
        }
      }
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="emAndamento() || iniciando()"
        (click)="iniciar()"
      >
        {{ lote() ? "Buscar novamente (estas matrículas)" : "Iniciar busca" }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DocumentosLegadoLoteDialogComponent implements OnInit, OnDestroy {
  private readonly service = inject(ImportacaoLegadoService);
  readonly dados = inject<DadosDocumentosLegadoLote>(MAT_DIALOG_DATA);

  readonly lote = signal<LoteDocumentos | null>(null);
  readonly carregado = signal(false);
  readonly iniciando = signal(false);
  readonly baixando = signal(false);
  private temporizador: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.atualizar();
    this.temporizador = setInterval(() => this.atualizar(), INTERVALO_MS);
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  emAndamento(): boolean {
    return this.lote()?.status === "EM_ANDAMENTO";
  }

  percentual(l: LoteDocumentos): number {
    return l.total ? Math.min(100, Math.floor((l.processados / l.total) * 100)) : 0;
  }

  private atualizar(): void {
    this.service.ultimoDocumentosLote().subscribe({
      next: (lote) => {
        this.lote.set(lote);
        this.carregado.set(true);
      },
      error: () => this.carregado.set(true),
    });
  }

  iniciar(): void {
    this.iniciando.set(true);
    this.service
      .iniciarDocumentosLote({ matriculaIds: this.dados.matriculaIds, filtros: this.dados.filtros })
      .subscribe({
        next: (lote) => {
          this.lote.set({ ...lote, problemas: [] });
          this.iniciando.set(false);
        },
        error: () => this.iniciando.set(false),
      });
  }

  cancelar(id: string): void {
    this.service.cancelarDocumentosLote(id).subscribe(() => this.atualizar());
  }

  baixarRelatorio(id: string): void {
    this.baixando.set(true);
    this.service.baixarRelatorioDocumentosLote(id).subscribe({
      next: (arquivo) => {
        salvarBlobComoArquivo(
          arquivo,
          `documentos-legado-${new Date().toISOString().slice(0, 10)}.xlsx`,
        );
        this.baixando.set(false);
      },
      error: () => this.baixando.set(false),
    });
  }
}
