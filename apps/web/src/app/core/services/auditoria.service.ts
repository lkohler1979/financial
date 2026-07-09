import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Auditoria, FiltrosAuditoria } from "../models/auditoria.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class AuditoriaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auditoria`;

  listar(filtros: FiltrosAuditoria = {}): Observable<Paginado<Auditoria>> {
    let params = new HttpParams();
    if (filtros.entidade) params = params.set("entidade", filtros.entidade);
    if (filtros.usuario) params = params.set("usuario", filtros.usuario);
    if (filtros.acao) params = params.set("acao", filtros.acao);
    if (filtros.dataInicio) params = params.set("dataInicio", filtros.dataInicio);
    if (filtros.dataFim) params = params.set("dataFim", filtros.dataFim);
    if (filtros.page) params = params.set("page", filtros.page);
    if (filtros.pageSize) params = params.set("pageSize", filtros.pageSize);
    return this.http.get<Paginado<Auditoria>>(this.baseUrl, { params });
  }

  listarEntidades(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/entidades`);
  }
}
