import { Component, inject } from "@angular/core";
import { CurrencyPipe } from "@angular/common";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { RelatoriosService } from "../../core/services/relatorios.service";
import { ItemRelatorio, RelatorioInadimplencia } from "../../core/models/relatorio.model";

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
        <table mat-table [dataSource]="itens" class="w-full">
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
          <ng-container matColumnDef="documento">
            <th mat-header-cell *matHeaderCellDef>Documento</th>
            <td mat-cell *matCellDef="let i">
              @if (i.documentoGerado) {
                <button mat-icon-button (click)="baixar(i)" aria-label="Baixar documento">
                  <mat-icon>download</mat-icon>
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

  colunas = ["alunoNome", "cursoNome", "valorTotal", "documento"];
  itens: ItemRelatorio[] = this.data.relatorio.itens ?? [];

  baixar(item: ItemRelatorio): void {
    window.open(this.service.urlDownload(this.data.relatorio.id, item.matriculaId), "_blank");
  }
}
