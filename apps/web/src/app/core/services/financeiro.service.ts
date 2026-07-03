import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Paginado } from "../models/paginado.model";
import { Parcela, StatusParcela } from "../models/parcela.model";

@Injectable({ providedIn: "root" })
export class FinanceiroService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/financeiro`;

  listar(opcoes: {
    matriculaId?: string;
    status?: StatusParcela;
    page?: number;
    pageSize?: number;
  }): Observable<Paginado<Parcela>> {
    let params = new HttpParams();
    if (opcoes.matriculaId) params = params.set("matriculaId", opcoes.matriculaId);
    if (opcoes.status) params = params.set("status", opcoes.status);
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<Parcela>>(this.baseUrl, { params });
  }
}
