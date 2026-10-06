import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Paginado } from "../models/paginado.model";
import { AtualizarSacadoPayload, Sacado, SacadoFicha, SacadoListado } from "../models/sacado.model";

@Injectable({ providedIn: "root" })
export class SacadosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/sacados`;

  /** Busca rápida (até 20) — usada no cadastro da matrícula. */
  buscar(busca: string): Observable<Sacado[]> {
    return this.http.get<Sacado[]>(this.baseUrl, { params: new HttpParams().set("busca", busca) });
  }

  listar(busca: string, page: number, pageSize: number): Observable<Paginado<SacadoListado>> {
    let params = new HttpParams().set("page", page).set("pageSize", pageSize);
    if (busca) params = params.set("busca", busca);
    return this.http.get<Paginado<SacadoListado>>(`${this.baseUrl}/lista`, { params });
  }

  ficha(id: string): Observable<SacadoFicha> {
    return this.http.get<SacadoFicha>(`${this.baseUrl}/${id}/ficha`);
  }

  atualizar(id: string, payload: AtualizarSacadoPayload): Observable<Sacado> {
    return this.http.put<Sacado>(`${this.baseUrl}/${id}`, payload);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
