import { DatePipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { DocumentoAguardandoConferencia } from "../../core/models/documento.model";
import { DocumentosService } from "../../core/services/documentos.service";
import { formatarCpf } from "../../shared/utils/cpf.util";

/**
 * Fila de conferência: documentos já enviados que ainda aguardam deferimento.
 * "Conferir" abre a matrícula, onde está o painel de documentos.
 */
@Component({
  selector: "app-documentos-pendentes",
  standalone: true,
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Documentos aguardando conferência</h1>
      <button mat-stroked-button type="button" (click)="carregar()">
        <mat-icon>refresh</mat-icon> Atualizar
      </button>
    </div>

    @if (carregando) {
      <mat-progress-bar mode="indeterminate"></mat-progress-bar>
    }

    <div class="bg-white rounded-lg border p-4 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-gray-400">
            <th class="py-1 pr-3">Cód. aluno</th>
            <th class="pr-3">Aluno</th>
            <th class="pr-3">CPF</th>
            <th class="pr-3">Matrícula</th>
            <th class="pr-3">Documento</th>
            <th class="pr-3">Anexado em</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (d of documentos; track d.id) {
            <tr class="border-t">
              <td class="py-2 pr-3">{{ d.aluno.codigo || "—" }}</td>
              <td class="pr-3">{{ d.aluno.nome }}</td>
              <td class="pr-3">{{ formatarCpf(d.aluno.cpf) }}</td>
              <td class="pr-3">{{ (d.matricula ?? d.aluno.matriculas[0])?.numeroMatricula || "—" }}</td>
              <td class="pr-3">{{ d.tipo.nome }}</td>
              <td class="pr-3">{{ d.anexadoEm | date: "dd/MM/yyyy HH:mm" }}</td>
              <td>
                @if (matriculaId(d); as id) {
                  <a mat-stroked-button [routerLink]="['/matriculas', id]">Conferir</a>
                }
              </td>
            </tr>
          } @empty {
            @if (!carregando) {
              <tr>
                <td colspan="7" class="py-4 text-gray-400">Nenhum documento aguardando conferência.</td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DocumentosPendentesComponent implements OnInit {
  private readonly service = inject(DocumentosService);
  protected readonly formatarCpf = formatarCpf;

  documentos: DocumentoAguardandoConferencia[] = [];
  carregando = false;

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.service.aguardandoConferencia().subscribe({
      next: (docs) => {
        this.documentos = docs;
        this.carregando = false;
      },
      error: () => (this.carregando = false),
    });
  }

  /** Documento de matrícula abre a própria; de aluno abre a matrícula mais recente dele. */
  matriculaId(d: DocumentoAguardandoConferencia): string | undefined {
    return (d.matricula ?? d.aluno.matriculas[0])?.id;
  }
}
