import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Curso, CursoPayload } from "../models/curso.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class CursosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/cursos`;

  listar(
    opcoes: { busca?: string; situacao?: boolean; page?: number; pageSize?: number } = {},
  ): Observable<Paginado<Curso>> {
    let params = new HttpParams();
    if (opcoes.busca) params = params.set("busca", opcoes.busca);
    if (opcoes.situacao !== undefined) params = params.set("situacao", opcoes.situacao);
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<Curso>>(this.baseUrl, { params });
  }

  buscarPorId(id: string): Observable<Curso> {
    return this.http.get<Curso>(`${this.baseUrl}/${id}`);
  }

  criar(payload: CursoPayload): Observable<Curso> {
    return this.http.post<Curso>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: CursoPayload): Observable<Curso> {
    return this.http.put<Curso>(`${this.baseUrl}/${id}`, payload);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
