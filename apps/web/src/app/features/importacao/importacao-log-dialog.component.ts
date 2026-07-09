import { Component, inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatTableModule } from "@angular/material/table";
import { Importacao } from "../../core/models/importacao.model";

export interface ImportacaoLogDialogData {
  importacao: Importacao;
}

@Component({
  selector: "app-importacao-log-dialog",
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatTableModule],
  template: `
    <h2 mat-dialog-title>Log de erros — {{ data.importacao.arquivo }}</h2>
    <mat-dialog-content>
      @if (erros.length > 0) {
        <table mat-table [dataSource]="erros" class="w-full table-compact">
          <ng-container matColumnDef="linha">
            <th mat-header-cell *matHeaderCellDef>Linha</th>
            <td mat-cell *matCellDef="let e">{{ e.linha }}</td>
          </ng-container>
          <ng-container matColumnDef="mensagem">
            <th mat-header-cell *matHeaderCellDef>Erro</th>
            <td mat-cell *matCellDef="let e">{{ e.mensagem }}</td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="colunas"></tr>
          <tr mat-row *matRowDef="let row; columns: colunas"></tr>
        </table>
      } @else {
        <p class="text-gray-500">Nenhum erro registrado nesta importação.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="true">Fechar</button>
    </mat-dialog-actions>
  `,
})
export class ImportacaoLogDialogComponent {
  readonly data = inject<ImportacaoLogDialogData>(MAT_DIALOG_DATA);
  colunas = ["linha", "mensagem"];
  erros = this.data.importacao.erros ?? [];
}
