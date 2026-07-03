import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Aluno, AlunoPayload } from "../models/aluno.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class AlunosService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/alunos`;

  listar(
    opcoes: { busca?: string; page?: number; pageSize?: number } = {},
  ): Observable<Paginado<Aluno>> {
    let params = new HttpParams();
    if (opcoes.busca) params = params.set("busca", opcoes.busca);
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<Aluno>>(this.baseUrl, { params });
  }

  buscarPorId(id: string): Observable<Aluno> {
    return this.http.get<Aluno>(`${this.baseUrl}/${id}`);
  }

  criar(payload: AlunoPayload): Observable<Aluno> {
    return this.http.post<Aluno>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: AlunoPayload): Observable<Aluno> {
    return this.http.put<Aluno>(`${this.baseUrl}/${id}`, payload);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
