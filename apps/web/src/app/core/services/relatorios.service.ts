import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import {
  FiltrosRelatorio,
  MatriculaElegivel,
  RelatorioInadimplencia,
} from "../models/relatorio.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class RelatoriosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/relatorios`;

  private paramsDeFiltros(filtros: FiltrosRelatorio): HttpParams {
    let params = new HttpParams();
    if (filtros.parcelasMinimas !== undefined) {
      params = params.set("parcelasMinimas", filtros.parcelasMinimas);
    }
    if (filtros.diasAtraso !== undefined) params = params.set("diasAtraso", filtros.diasAtraso);
    if (filtros.valorMinimo !== undefined) params = params.set("valorMinimo", filtros.valorMinimo);
    if (filtros.cursoId) params = params.set("cursoId", filtros.cursoId);
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

  gerar(filtros: FiltrosRelatorio, matriculaIds?: string[]): Observable<RelatorioInadimplencia> {
    return this.http.post<RelatorioInadimplencia>(this.baseUrl, { ...filtros, matriculaIds });
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

  urlDownload(relatorioId: string, matriculaId: string): string {
    return `${this.baseUrl}/${relatorioId}/itens/${matriculaId}/documento`;
  }
}
