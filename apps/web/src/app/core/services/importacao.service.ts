import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Importacao, StatusJobImportacao } from "../models/importacao.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class ImportacaoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/importacao`;

  upload(arquivo: File): Observable<{ jobId: string }> {
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    return this.http.post<{ jobId: string }>(`${this.baseUrl}/upload`, formData);
  }

  statusJob(jobId: string): Observable<StatusJobImportacao> {
    return this.http.get<StatusJobImportacao>(`${this.baseUrl}/jobs/${jobId}/status`);
  }

  listar(opcoes: { page?: number; pageSize?: number } = {}): Observable<Paginado<Importacao>> {
    let params = new HttpParams();
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<Importacao>>(this.baseUrl, { params });
  }
}
