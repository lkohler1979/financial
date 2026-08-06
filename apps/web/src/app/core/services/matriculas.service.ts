import { HttpClient, HttpParams } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../../environments/environment";
import { Matricula, MatriculaPayload } from "../models/matricula.model";
import { Paginado } from "../models/paginado.model";

@Injectable({ providedIn: "root" })
export class MatriculasService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/matriculas`;

  listar(
    opcoes: {
      alunoId?: string;
      cursoId?: string;
      situacao?: string;
      alunoNome?: string;
      alunoCpf?: string;
      dataMatriculaInicio?: string;
      dataMatriculaFim?: string;
      situacaoCobrancaId?: string;
      tagId?: string;
      tcdAssinado?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ): Observable<Paginado<Matricula>> {
    let params = new HttpParams();
    if (opcoes.alunoId) params = params.set("alunoId", opcoes.alunoId);
    if (opcoes.cursoId) params = params.set("cursoId", opcoes.cursoId);
    if (opcoes.situacao) params = params.set("situacao", opcoes.situacao);
    if (opcoes.alunoNome) params = params.set("alunoNome", opcoes.alunoNome);
    if (opcoes.alunoCpf) params = params.set("alunoCpf", opcoes.alunoCpf);
    if (opcoes.dataMatriculaInicio) {
      params = params.set("dataMatriculaInicio", opcoes.dataMatriculaInicio);
    }
    if (opcoes.dataMatriculaFim) params = params.set("dataMatriculaFim", opcoes.dataMatriculaFim);
    if (opcoes.situacaoCobrancaId) {
      params = params.set("situacaoCobrancaId", opcoes.situacaoCobrancaId);
    }
    if (opcoes.tagId) params = params.set("tagId", opcoes.tagId);
    if (opcoes.tcdAssinado !== undefined) params = params.set("tcdAssinado", opcoes.tcdAssinado);
    if (opcoes.page) params = params.set("page", opcoes.page);
    if (opcoes.pageSize) params = params.set("pageSize", opcoes.pageSize);
    return this.http.get<Paginado<Matricula>>(this.baseUrl, { params });
  }

  buscarPorId(id: string): Observable<Matricula> {
    return this.http.get<Matricula>(`${this.baseUrl}/${id}`);
  }

  criar(payload: MatriculaPayload): Observable<Matricula> {
    return this.http.post<Matricula>(this.baseUrl, payload);
  }

  atualizar(id: string, payload: MatriculaPayload): Observable<Matricula> {
    return this.http.put<Matricula>(`${this.baseUrl}/${id}`, payload);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
