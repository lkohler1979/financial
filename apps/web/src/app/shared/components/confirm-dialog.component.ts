import { Component, inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

export interface ConfirmDialogData {
  titulo: string;
  mensagem: string;
  confirmarTexto?: string;
}

/** Confirmação de ação destrutiva (remover): ícone de alerta, texto e botões Cancelar / confirmar. */
@Component({
  selector: "app-confirm-dialog",
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="flex gap-4 px-6 pt-6">
      <span
        class="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--ef-bad-bg)] text-[var(--ef-bad)]"
      >
        <mat-icon>delete</mat-icon>
      </span>
      <div class="min-w-0">
        <h2 class="m-0 text-lg font-semibold" mat-dialog-title style="padding: 0">
          {{ data.titulo }}
        </h2>
        <mat-dialog-content class="!p-0 !pt-1 text-sm text-muted">{{
          data.mensagem
        }}</mat-dialog-content>
      </div>
    </div>
    <mat-dialog-actions align="end" class="!px-6 !pb-5 !pt-4">
      <button mat-stroked-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">
        {{ data.confirmarTexto ?? "Confirmar" }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ConfirmDialogComponent>);

  constructor() {
    this.ref.disableClose = false;
  }
}
