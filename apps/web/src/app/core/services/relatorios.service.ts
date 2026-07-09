import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable, catchError, of } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  FiltrosRelatorio,
  GerarRelatorioResultado,
  MatriculaElegivel,
  RelatorioInadimplencia,
  StatusJobRelatorio,
  UltimoDocumentoMatricula,
} from "../models/relatorio.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class RelatoriosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/relatorios`;

  private paramsDeFiltros(filtros: FiltrosRelatorio): HttpParams {
    let params = new HttpParams();
    if (filtros.diasAtraso !== undefined) params = params.set("diasAtraso", filtros.diasAtraso);
    if (filtros.valorMinimo !== undefined) params = params.set("valorMinimo", filtros.valorMinimo);
    if (filtros.cursoId) params = params.set("cursoId", filtros.cursoId);
    if (filtros.situacaoCobrancaId) {
      params = params.set("situacaoCobrancaId", filtros.situacaoCobrancaId);
    }
    if (filtros.tagId) params = params.set("tagId", filtros.tagId);
    if (filtros.ignorarSituacoesTratadas !== undefined) {
      params = params.set("ignorarSituacoesTratadas", filtros.ignorarSituacoesTratadas);
    }
    return params;
  }

  previaElegiveis(
    filtros: FiltrosRelatorio,
  ): Observable<{ data: MatriculaElegivel[]; total: number }> {
    return this.http.get<{ data: MatriculaElegivel[]; total: number }>(
      `${this.baseUrl}/elegiveis`,
      { params: this.paramsDeFiltros(filtros) },
    );
  }

  gerar(filtros: FiltrosRelatorio, matriculaIds?: string[]): Observable<GerarRelatorioResultado> {
    return this.http.post<GerarRelatorioResultado>(this.baseUrl, { ...filtros, matriculaIds });
  }

  statusJob(jobId: string): Observable<StatusJobRelatorio> {
    return this.http.get<StatusJobRelatorio>(`${this.baseUrl}/jobs/${jobId}/status`);
  }

  listar(
    opcoes: { page?: number; pageSize?: number } = {},
  ): Observable<Paginado<RelatorioInadimplencia>> {
    let params = new HttpParams();
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<RelatorioInadimplencia>>(this.baseUrl, { params });
  }

  buscarPorId(id: string): Observable<RelatorioInadimplencia> {
    return this.http.get<RelatorioInadimplencia>(`${this.baseUrl}/${id}`);
  }

  excluir(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  urlDownload(relatorioId: string, matriculaId: string, formato: "docx" | "pdf" = "docx"): string {
    return `${this.baseUrl}/${relatorioId}/itens/${matriculaId}/documento?formato=${formato}`;
  }

  /** Último documento já gerado para a matrícula (qualquer relatório), ou
   * `null` se nunca foi gerado — usado quando não há mais parcela elegível
   * para oferecer o documento existente em vez de simplesmente falhar. */
  buscarUltimoDocumentoDaMatricula(matriculaId: string): Observable<UltimoDocumentoMatricula | null> {
    return this.http
      .get<UltimoDocumentoMatricula>(`${this.baseUrl}/matriculas/${matriculaId}/ultimo-documento`)
      .pipe(catchError(() => of(null)));
  }
}
