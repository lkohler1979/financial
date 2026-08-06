import { Component, inject } from "@angular/core";
import { CurrencyPipe } from "@angular/common";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { RelatoriosService } from "../../core/services/relatorios.service";
import { ItemRelatorio, RelatorioInadimplencia } from "../../core/models/relatorio.model";
import { extrairNomeArquivo, salvarBlobComoArquivo } from "../../shared/utils/download.util";

export interface RelatorioDetalheDialogData {
  relatorio: RelatorioInadimplencia;
}

@Component({
  selector: "app-relatorio-detalhe-dialog",
  standalone: true,
  imports: [CurrencyPipe, MatDialogModule, MatButtonModule, MatIconModule, MatTableModule],
  template: `
    <h2 mat-dialog-title>Itens do relatório</h2>
    <mat-dialog-content>
      @if (itens.length === 0) {
        <p class="text-gray-500">Nenhum item neste relatório.</p>
      }
      @if (itens.length > 0) {
        <table mat-table [dataSource]="itens" class="w-full table-compact">
          <ng-container matColumnDef="alunoNome">
            <th mat-header-cell *matHeaderCellDef>Aluno</th>
            <td mat-cell *matCellDef="let i">{{ i.alunoNome }}</td>
          </ng-container>
          <ng-container matColumnDef="cursoNome">
            <th mat-header-cell *matHeaderCellDef>Curso</th>
            <td mat-cell *matCellDef="let i">{{ i.cursoNome }}</td>
          </ng-container>
          <ng-container matColumnDef="valorTotal">
            <th mat-header-cell *matHeaderCellDef>Total devedor</th>
            <td mat-cell *matCellDef="let i">{{ i.valorTotal | currency: "BRL" }}</td>
          </ng-container>
          <ng-container matColumnDef="tipo">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let i">{{ rotuloTipo(i.tipoTituloDocumento) }}</td>
          </ng-container>
          <ng-container matColumnDef="documento">
            <th mat-header-cell *matHeaderCellDef>Documento</th>
            <td mat-cell *matCellDef="let i">
              @if (i.documentoGerado) {
                <button
                  mat-button
                  class="!min-w-0 !px-2"
                  (click)="baixar(i, 'docx')"
                  aria-label="Baixar Word"
                >
                  Word
                </button>
                <button
                  mat-button
                  class="!min-w-0 !px-2"
                  (click)="baixar(i, 'pdf')"
                  aria-label="Baixar PDF"
                >
                  PDF
                </button>
              } @else {
                <span class="text-gray-400 text-xs">pendente</span>
              }
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="colunas"></tr>
          <tr mat-row *matRowDef="let row; columns: colunas"></tr>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="true">Fechar</button>
    </mat-dialog-actions>
  `,
})
export class RelatorioDetalheDialogComponent {
  private readonly service = inject(RelatoriosService);
  readonly data = inject<RelatorioDetalheDialogData>(MAT_DIALOG_DATA);

  colunas = ["alunoNome", "cursoNome", "valorTotal", "tipo", "documento"];
  itens: ItemRelatorio[] = this.data.relatorio.itens ?? [];

  rotuloTipo(tipo?: "MENSALIDADE" | "RENEGOCIACAO"): string {
    if (tipo === "MENSALIDADE") return "Mensalidade";
    if (tipo === "RENEGOCIACAO") return "Renegociação";
    return "—";
  }

  baixar(item: ItemRelatorio, formato: "docx" | "pdf"): void {
    this.service
      .baixarDocumento(this.data.relatorio.id, item.matriculaId, formato, item.tipoTituloDocumento)
      .subscribe((resp) => {
        const nome = extrairNomeArquivo(
          resp.headers.get("content-disposition"),
          `documento.${formato}`,
        );
        salvarBlobComoArquivo(resp.body as Blob, nome);
      });
  }
}
