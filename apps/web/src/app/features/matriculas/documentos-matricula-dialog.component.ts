import { DatePipe, DecimalPipe } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { Documento, DocumentosDaMatricula } from "../../core/models/documento.model";
import { DocumentosService } from "../../core/services/documentos.service";
import { DocumentoVisualizadorDialogComponent } from "../../shared/components/documento-visualizador-dialog.component";
import { salvarBlobComoArquivo } from "../../shared/utils/download.util";
import { DocumentosLegadoDialogComponent } from "../alunos/documentos-legado-dialog.component";

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  DEFERIDO: { texto: "Deferido", classe: "bg-green-100 text-green-800" },
  INDEFERIDO: { texto: "Indeferido", classe: "bg-red-100 text-red-800" },
  PENDENTE: { texto: "Pendente", classe: "bg-amber-100 text-amber-800" },
};

/**
 * Lista de documentos de uma matrícula (e do aluno): situação de entrega e de deferimento, com
 * botões para visualizar na tela e baixar cada arquivo, e para buscar os documentos do aluno no
 * sistema legado.
 */
@Component({
  selector: "app-documentos-matricula-dialog",
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Documentos — {{ dados.aluno }}</h2>
    <mat-dialog-content>
      <p class="text-sm text-gray-600 mt-0">
        Matrícula {{ dados.numeroMatricula || "sem número" }}
        @if (dados.curso) {
          · {{ dados.curso }}
        }
      </p>

      @if (carregando()) {
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      @if (lista(); as l) {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1 pr-2">Documento</th>
              <th class="pr-2">Entrega</th>
              <th class="pr-2">Situação</th>
              <th class="pr-2">Arquivo</th>
              <th class="pr-2">Anexado em</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            @for (item of l.itens; track item.tipo.id) {
              <tr class="border-t align-top">
                <td class="py-2 pr-2">
                  {{ item.tipo.nome }}
                  @if (item.tipo.obrigatorio) {
                    <span class="block text-xs text-gray-400">obrigatório</span>
                  }
                </td>
                <td class="pr-2 whitespace-nowrap">
                  {{ item.documento?.situacaoEntrega === "ENVIADO" ? "Enviado" : "Não enviado" }}
                </td>
                <td class="pr-2">
                  @if (item.documento?.situacaoEntrega === "ENVIADO") {
                    <span
                      class="px-2 py-0.5 rounded text-xs"
                      [class]="situacao(item.documento!).classe"
                    >
                      {{ situacao(item.documento!).texto }}
                    </span>
                  } @else {
                    —
                  }
                </td>
                <td class="pr-2">
                  @if (item.documento?.arquivoNome) {
                    {{ item.documento!.arquivoNome }}
                    @if (item.documento!.arquivoTamanho) {
                      <span class="text-xs text-gray-500">
                        ({{ item.documento!.arquivoTamanho! / 1024 | number: "1.0-0" }} KB)
                      </span>
                    }
                  } @else {
                    —
                  }
                </td>
                <td class="pr-2 whitespace-nowrap">
                  {{
                    item.documento?.anexadoEm
                      ? (item.documento!.anexadoEm | date: "dd/MM/yyyy")
                      : "—"
                  }}
                </td>
                <td class="text-right whitespace-nowrap">
                  @if (item.documento?.arquivoNome) {
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Visualizar documento"
                      title="Visualizar"
                      (click)="visualizar(item.documento!)"
                    >
                      <mat-icon>visibility</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Baixar documento"
                      title="Baixar"
                      (click)="baixar(item.documento!)"
                    >
                      <mat-icon>download</mat-icon>
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      @if (lista(); as l) {
        <button mat-stroked-button type="button" (click)="buscarNoLegado(l)">
          <mat-icon>cloud_download</mat-icon> Buscar no legado
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class DocumentosMatriculaDialogComponent implements OnInit {
  private readonly service = inject(DocumentosService);
  private readonly dialog = inject(MatDialog);
  readonly dados = inject<{
    matriculaId: string;
    aluno: string;
    numeroMatricula: string | null;
    curso: string | null;
  }>(MAT_DIALOG_DATA);

  readonly carregando = signal(false);
  readonly lista = signal<DocumentosDaMatricula | null>(null);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.service.listarDaMatricula(this.dados.matriculaId).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }

  situacao(documento: Documento) {
    return SITUACAO[documento.situacaoDeferimento] ?? SITUACAO["PENDENTE"];
  }

  visualizar(documento: Documento): void {
    this.dialog.open(DocumentoVisualizadorDialogComponent, {
      width: "900px",
      maxWidth: "95vw",
      data: {
        id: documento.id,
        nome: documento.arquivoNome ?? "documento",
        mime: documento.arquivoMime,
      },
    });
  }

  baixar(documento: Documento): void {
    this.service
      .baixar(documento.id)
      .subscribe((blob) => salvarBlobComoArquivo(blob, documento.arquivoNome ?? "documento"));
  }

  /** Busca no legado os documentos do aluno dono da matrícula e recarrega a lista ao terminar. */
  buscarNoLegado(lista: DocumentosDaMatricula): void {
    this.dialog
      .open(DocumentosLegadoDialogComponent, {
        width: "760px",
        maxHeight: "90vh",
        data: { id: lista.aluno.id, nome: lista.aluno.nome },
      })
      .afterClosed()
      .subscribe(() => this.carregar());
  }
}
