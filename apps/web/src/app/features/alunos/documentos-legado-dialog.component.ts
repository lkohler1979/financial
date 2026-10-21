import { DecimalPipe } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, OnInit, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import {
  ImportacaoLegadoService,
  ResultadoDocumentoLegado,
  ResumoDocumentosLegado,
} from "../../core/services/importacao-legado.service";

const ROTULO: Record<ResultadoDocumentoLegado, { texto: string; classe: string }> = {
  BAIXADO: { texto: "Baixado", classe: "bg-green-100 text-green-800" },
  JA_IMPORTADO: { texto: "Já importado", classe: "bg-gray-100 text-gray-700" },
  MANTIDO_ETHOS: { texto: "Mantido do Ethos", classe: "bg-amber-100 text-amber-800" },
  SEM_DOCUMENTO: { texto: "Não entregue", classe: "bg-gray-100 text-gray-600" },
  SEM_ARQUIVO: { texto: "Sem arquivo", classe: "bg-gray-100 text-gray-600" },
  ERRO: { texto: "Erro", classe: "bg-red-100 text-red-800" },
};

const SITUACAO: Record<string, string> = {
  DEFERIDO: "Deferido",
  INDEFERIDO: "Indeferido",
  PENDENTE: "Pendente",
};

/**
 * Busca no sistema legado os documentos pessoais do aluno (CPF, RG, comprovante de residência…)
 * e baixa os arquivos para a pasta de documentos (apps/documentos), criando/atualizando os
 * documentos do aluno no Ethos. Pode ser repetido: o que já foi importado não é baixado de novo.
 */
@Component({
  selector: "app-documentos-legado-dialog",
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, MatDialogModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Documentos do legado — {{ aluno.nome }}</h2>
    <mat-dialog-content>
      @if (carregando()) {
        <p class="text-sm text-gray-600 mt-0">
          Buscando os documentos no sistema legado e baixando os arquivos…
        </p>
        <mat-progress-bar mode="indeterminate"></mat-progress-bar>
      }

      @if (erro(); as mensagem) {
        <p class="text-sm text-red-700">{{ mensagem }}</p>
      }

      @if (resumo(); as r) {
        <p class="text-sm text-gray-600 mt-0">
          CPF {{ r.aluno.cpf }} · <strong>{{ r.baixados }}</strong> baixado(s),
          {{ r.jaImportados }} já importado(s), {{ r.semDocumento }} não entregue(s)
          @if (r.mantidos) {
            , {{ r.mantidos }} mantido(s) do Ethos
          }
          @if (r.erros) {
            , <span class="text-red-700">{{ r.erros }} com erro</span>
          }
        </p>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-400">
              <th class="py-1">Documento</th>
              <th class="py-1">Resultado</th>
              <th class="py-1">Arquivo</th>
              <th class="py-1">Situação</th>
            </tr>
          </thead>
          <tbody>
            @for (i of r.itens; track i.tipo) {
              <tr class="border-t align-top">
                <td class="py-1 pr-2">{{ i.tipo }}</td>
                <td class="py-1 pr-2 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded text-xs" [class]="rotulo(i.resultado).classe">
                    {{ rotulo(i.resultado).texto }}
                  </span>
                </td>
                <td class="py-1 pr-2">
                  @if (i.arquivo) {
                    {{ i.arquivo }}
                    @if (i.bytes) {
                      <span class="text-xs text-gray-500"
                        >({{ i.bytes / 1024 | number: "1.0-0" }} KB)</span
                      >
                    }
                  } @else {
                    —
                  }
                  @if (i.detalhe) {
                    <span
                      class="block text-xs"
                      [class]="i.resultado === 'ERRO' ? 'text-red-700' : 'text-gray-500'"
                    >
                      {{ i.detalhe }}
                    </span>
                  }
                </td>
                <td class="py-1">{{ i.situacao ? situacao(i.situacao) : "—" }}</td>
              </tr>
            }
          </tbody>
        </table>
        <p class="text-xs text-gray-500 mb-0">
          Os arquivos ficam em <code>apps/documentos</code> e aparecem nos documentos do aluno.
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Fechar</button>
      <button mat-stroked-button type="button" [disabled]="carregando()" (click)="buscar()">
        Buscar novamente
      </button>
    </mat-dialog-actions>
  `,
})
export class DocumentosLegadoDialogComponent implements OnInit {
  private readonly service = inject(ImportacaoLegadoService);
  readonly aluno = inject<{ id: string; nome: string }>(MAT_DIALOG_DATA);

  readonly carregando = signal(false);
  readonly resumo = signal<ResumoDocumentosLegado | null>(null);
  readonly erro = signal<string | null>(null);

  ngOnInit(): void {
    this.buscar();
  }

  rotulo(resultado: ResultadoDocumentoLegado) {
    return ROTULO[resultado];
  }

  situacao(valor: string): string {
    return SITUACAO[valor] ?? valor;
  }

  buscar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.service.importarDocumentos(this.aluno.id).subscribe({
      next: (resumo) => {
        this.resumo.set(resumo);
        this.carregando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.carregando.set(false);
        this.erro.set(e.error?.mensagem ?? "Não foi possível buscar os documentos no legado.");
      },
    });
  }
}
