import { DatePipe } from "@angular/common";
import { Component, inject, OnInit } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatPaginatorModule, PageEvent } from "@angular/material/paginator";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { debounceTime, distinctUntilChanged } from "rxjs";
import { DocumentoListado, SituacaoDeferimentoDocumento } from "../../core/models/documento.model";
import { DocumentosService } from "../../core/services/documentos.service";
import { DocumentoVisualizadorDialogComponent } from "../../shared/components/documento-visualizador-dialog.component";
import { formatarCpf } from "../../shared/utils/cpf.util";
import { salvarBlobComoArquivo } from "../../shared/utils/download.util";

const SITUACOES: { valor: SituacaoDeferimentoDocumento | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "PENDENTE", rotulo: "Pendentes" },
  { valor: "DEFERIDO", rotulo: "Deferidos" },
  { valor: "INDEFERIDO", rotulo: "Indeferidos" },
];

const CLASSE: Record<SituacaoDeferimentoDocumento, string> = {
  DEFERIDO: "bg-green-100 text-green-800",
  INDEFERIDO: "bg-red-100 text-red-800",
  PENDENTE: "bg-amber-100 text-amber-800",
};

/**
 * Documentos: todos os arquivos enviados (pelo aluno, pela equipe ou importados do legado), com o
 * aluno, as matrículas e a situação (deferido, indeferido ou pendente). Cada linha abre o
 * visualizador, baixa o arquivo ou leva à matrícula, onde se confere/defere o documento.
 */
@Component({
  selector: "app-documentos-pendentes",
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-medium m-0">Documentos</h1>
      <button mat-stroked-button type="button" (click)="carregar()">
        <mat-icon>refresh</mat-icon> Atualizar
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2 mb-3">
      @for (s of situacoes; track s.valor) {
        <button
          type="button"
          class="px-3 py-1 rounded-full border text-sm"
          [class]="situacao === s.valor ? 'bg-blue-700 text-white border-blue-700' : 'bg-white'"
          (click)="filtrar(s.valor)"
        >
          {{ s.rotulo }}
          <span class="text-xs opacity-80">({{ contagem(s.valor) }})</span>
        </button>
      }
      <span class="flex-1"></span>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-72">
        <mat-label>Buscar por nome, CPF ou código</mat-label>
        <input matInput [formControl]="busca" />
        <mat-icon matSuffix>search</mat-icon>
      </mat-form-field>
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
            <th class="pr-3">Situação</th>
            <th class="pr-3">Anexado em</th>
            <th class="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          @for (d of documentos; track d.id) {
            <tr class="border-t align-top">
              <td class="py-2 pr-3">{{ d.aluno.codigo || "—" }}</td>
              <td class="pr-3">{{ d.aluno.nome }}</td>
              <td class="pr-3 whitespace-nowrap">{{ formatarCpf(d.aluno.cpf) }}</td>
              <td class="pr-3">
                @for (m of matriculasDe(d); track m.id) {
                  <a class="block text-blue-700" [routerLink]="['/matriculas', m.id]">
                    {{ m.numeroMatricula || "s/ número" }}
                    <span class="text-xs text-gray-500">· {{ m.curso.nome }}</span>
                  </a>
                } @empty {
                  —
                }
              </td>
              <td class="pr-3">{{ d.tipo.nome }}</td>
              <td class="pr-3 whitespace-nowrap">
                <span class="px-2 py-0.5 rounded text-xs" [class]="classe(d)">
                  {{ rotulo(d) }}
                </span>
                @if (d.deferidoEm) {
                  <span class="block text-xs text-gray-500">
                    {{ d.deferidoEm | date: "dd/MM/yyyy" }}
                  </span>
                }
              </td>
              <td class="pr-3 whitespace-nowrap">{{ d.anexadoEm | date: "dd/MM/yyyy HH:mm" }}</td>
              <td class="text-right whitespace-nowrap">
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Visualizar documento"
                  title="Visualizar"
                  (click)="visualizar(d)"
                >
                  <mat-icon>visibility</mat-icon>
                </button>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Baixar documento"
                  title="Baixar"
                  (click)="baixar(d)"
                >
                  <mat-icon>download</mat-icon>
                </button>
                @if (matriculaId(d); as id) {
                  <a mat-stroked-button [routerLink]="['/matriculas', id]">Conferir</a>
                }
              </td>
            </tr>
          } @empty {
            @if (!carregando) {
              <tr>
                <td colspan="8" class="py-4 text-gray-400">Nenhum documento encontrado.</td>
              </tr>
            }
          }
        </tbody>
      </table>
      <mat-paginator
        [length]="total"
        [pageIndex]="page - 1"
        [pageSize]="pageSize"
        [pageSizeOptions]="[20, 50, 100]"
        (page)="mudarPagina($event)"
      ></mat-paginator>
    </div>
  `,
})
export class DocumentosPendentesComponent implements OnInit {
  private readonly service = inject(DocumentosService);
  private readonly dialog = inject(MatDialog);
  protected readonly formatarCpf = formatarCpf;

  readonly situacoes = SITUACOES;
  readonly busca = new FormControl("", { nonNullable: true });

  documentos: DocumentoListado[] = [];
  totais: Record<SituacaoDeferimentoDocumento, number> = {
    PENDENTE: 0,
    DEFERIDO: 0,
    INDEFERIDO: 0,
  };
  situacao: SituacaoDeferimentoDocumento | "" = "";
  total = 0;
  page = 1;
  pageSize = 20;
  carregando = false;

  ngOnInit(): void {
    this.busca.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
      this.page = 1;
      this.carregar();
    });
    this.carregar();
  }

  carregar(): void {
    this.carregando = true;
    this.service
      .listar({
        situacao: this.situacao,
        busca: this.busca.value,
        page: this.page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (pagina) => {
          this.documentos = pagina.data;
          this.total = pagina.total;
          this.totais = pagina.totais;
          this.carregando = false;
        },
        error: () => (this.carregando = false),
      });
  }

  filtrar(situacao: SituacaoDeferimentoDocumento | ""): void {
    this.situacao = situacao;
    this.page = 1;
    this.carregar();
  }

  mudarPagina(evento: PageEvent): void {
    this.page = evento.pageIndex + 1;
    this.pageSize = evento.pageSize;
    this.carregar();
  }

  contagem(situacao: SituacaoDeferimentoDocumento | ""): number {
    return situacao
      ? this.totais[situacao]
      : this.totais.PENDENTE + this.totais.DEFERIDO + this.totais.INDEFERIDO;
  }

  classe(d: DocumentoListado): string {
    return CLASSE[d.situacaoDeferimento];
  }

  rotulo(d: DocumentoListado): string {
    return { DEFERIDO: "Deferido", INDEFERIDO: "Indeferido", PENDENTE: "Pendente" }[
      d.situacaoDeferimento
    ];
  }

  /** Documento de matrícula mostra a própria; o de aluno vale para todas as matrículas dele. */
  matriculasDe(d: DocumentoListado) {
    return d.matricula
      ? d.aluno.matriculas.filter((m) => m.id === d.matricula!.id)
      : d.aluno.matriculas;
  }

  /** "Conferir" abre a matrícula do documento, ou a mais recente do aluno. */
  matriculaId(d: DocumentoListado): string | undefined {
    return (d.matricula ?? d.aluno.matriculas[0])?.id;
  }

  visualizar(d: DocumentoListado): void {
    this.dialog.open(DocumentoVisualizadorDialogComponent, {
      width: "900px",
      maxWidth: "95vw",
      data: { id: d.id, nome: d.arquivoNome ?? "documento", mime: d.arquivoMime },
    });
  }

  baixar(d: DocumentoListado): void {
    this.service
      .baixar(d.id)
      .subscribe((blob) => salvarBlobComoArquivo(blob, d.arquivoNome ?? "documento"));
  }
}
